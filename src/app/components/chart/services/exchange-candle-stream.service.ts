import { Injectable, NgZone, inject } from '@angular/core';
import { Observable, Subject, take } from 'rxjs';
import { Candle } from 'src/app/modules/shared/models/chart/candle.dto';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import {
  BaseCandleSnapshot,
  LiveCandleUpdate,
} from '../models/live-candle-update';
import { sanitizeStreamSymbol } from '../utils/binance-market';
import { parseUtcMs } from '../utils/merge-live-candles';
import { SymbolCandleAggregator } from '../utils/symbol-candle-aggregator';
import {
  getTimeframeBucketStart,
  isOneMinuteTimeframe,
  normalizeTimeframe,
} from '../utils/timeframe-bucketing';

export interface ExchangeCandleStreamService {
  readonly exchangeName: string;
  connectKlineStream(
    symbol: string,
    timeframe: string,
  ): Observable<LiveCandleUpdate>;
  disconnect(): void;
}

export interface ParsedStreamCandle {
  symbol: string;
  candle: BaseCandleSnapshot;
  isClosed: boolean;
}

/** Above this many elapsed minutes the seed uses the target timeframe's own candle. */
export const MAX_ONE_MINUTE_SEED_CANDLES = 1000;
/** A connection must stay open this long before the backoff counter resets. */
export const STABLE_CONNECTION_MS = 10_000;

@Injectable()
export abstract class BrowserExchangeCandleStreamService implements ExchangeCandleStreamService {
  abstract readonly exchangeName: string;

  private readonly zone = inject(NgZone);
  private readonly marketService = inject(ChartService);
  private readonly updatesSubject = new Subject<LiveCandleUpdate>();
  private readonly pendingBySymbol = new Map<string, BaseCandleSnapshot>();

  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectionGeneration = 0;
  /** Exchange-normalized symbol (URLs, subscribe messages, incoming message filter). */
  private activeSymbol = '';
  /** Symbol as the caller passed it (upper-cased): used for REST seeding and emitted updates. */
  private activeRequestSymbol = '';
  private activeTimeframe = '';
  private retryCount = 0;
  private aggregator = new SymbolCandleAggregator();

  connectKlineStream(
    symbol: string,
    timeframe: string,
  ): Observable<LiveCandleUpdate> {
    this.disconnect();

    const requestSymbol = (symbol || '').toUpperCase().trim();
    const normalizedSymbol = requestSymbol
      ? sanitizeStreamSymbol(
          this.normalizeSymbol(symbol),
          `${this.exchangeName}Stream`,
        )
      : null;
    const normalizedTimeframe = normalizeTimeframe(timeframe);

    if (!normalizedSymbol || !normalizedTimeframe) {
      return this.updatesSubject.asObservable();
    }

    this.activeSymbol = normalizedSymbol;
    this.activeRequestSymbol = requestSymbol;
    this.activeTimeframe = normalizedTimeframe;
    this.aggregator = new SymbolCandleAggregator();

    const generation = this.connectionGeneration;
    this.seedAggregator(
      normalizedSymbol,
      requestSymbol,
      normalizedTimeframe,
      generation,
    );

    return this.updatesSubject.asObservable();
  }

  disconnect(): void {
    this.connectionGeneration++;
    this.activeSymbol = '';
    this.activeRequestSymbol = '';
    this.activeTimeframe = '';
    this.retryCount = 0;
    this.pendingBySymbol.clear();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearConnectionTimers();
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    }
  }

  protected normalizeSymbol(symbol: string): string {
    return (symbol || '').toUpperCase().trim();
  }

  protected abstract getSocketUrl(symbol: string): string;

  protected getSubscribeMessage(symbol: string): unknown | null {
    void symbol;
    return null;
  }

  /** Application-level keepalive message sent while the socket is open; null disables it. */
  protected getHeartbeatMessage(): unknown | null {
    return null;
  }

  /** Interval for `getHeartbeatMessage()`; 0 disables the heartbeat. */
  protected getHeartbeatIntervalMs(): number {
    return 0;
  }

  protected abstract parseMessage(messageData: string): ParsedStreamCandle[];

  protected rolloverClose(
    symbol: string,
    incoming: BaseCandleSnapshot,
  ): ParsedStreamCandle[] {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const previous = this.pendingBySymbol.get(normalizedSymbol);
    const updates: ParsedStreamCandle[] = [];

    if (previous && previous.time !== incoming.time) {
      updates.push({
        symbol: normalizedSymbol,
        candle: previous,
        isClosed: true,
      });
    }

    this.pendingBySymbol.set(normalizedSymbol, incoming);
    updates.push({
      symbol: normalizedSymbol,
      candle: incoming,
      isClosed: false,
    });

    return updates;
  }

  protected readNumber(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : NaN;
  }

  private clearConnectionTimers(): void {
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private openSocket(symbol: string, generation: number): void {
    if (
      generation !== this.connectionGeneration ||
      this.activeSymbol !== symbol
    )
      return;

    this.zone.runOutsideAngular(() => {
      const socket = new WebSocket(this.getSocketUrl(symbol));
      this.socket = socket;

      socket.onopen = () => {
        if (this.socket !== socket) return;
        this.clearConnectionTimers();
        // Only forgive earlier failures once the connection proved stable; a
        // socket that opens and drops right away must keep backing off.
        this.stableTimer = setTimeout(() => {
          this.stableTimer = null;
          if (this.socket === socket) this.retryCount = 0;
        }, STABLE_CONNECTION_MS);

        const subscribeMessage = this.getSubscribeMessage(symbol);
        if (subscribeMessage) {
          socket.send(JSON.stringify(subscribeMessage));
        }

        const heartbeat = this.getHeartbeatMessage();
        const heartbeatMs = this.getHeartbeatIntervalMs();
        if (heartbeat && heartbeatMs > 0) {
          const payload = JSON.stringify(heartbeat);
          this.heartbeatTimer = setInterval(() => {
            if (
              this.socket === socket &&
              socket.readyState === WebSocket.OPEN
            ) {
              socket.send(payload);
            }
          }, heartbeatMs);
        }
      };

      socket.onmessage = (event: MessageEvent) => {
        if (generation !== this.connectionGeneration) return;
        for (const parsed of this.parseMessage(String(event.data))) {
          this.handleParsedCandle(parsed);
        }
      };

      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.clearConnectionTimers();
        this.scheduleReconnect(symbol, generation);
      };
    });
  }

  private handleParsedCandle(parsed: ParsedStreamCandle): void {
    if (!this.activeSymbol || !this.activeTimeframe) return;
    if (this.normalizeSymbol(parsed.symbol) !== this.activeSymbol) return;

    const updates = this.aggregator.update(
      this.activeRequestSymbol || this.activeSymbol,
      parsed.candle,
      parsed.isClosed,
      [this.activeTimeframe],
    );

    for (const update of updates) {
      if (normalizeTimeframe(update.interval) === this.activeTimeframe) {
        this.updatesSubject.next(update);
      }
    }
  }

  private scheduleReconnect(symbol: string, generation: number): void {
    if (
      generation !== this.connectionGeneration ||
      this.activeSymbol !== symbol
    )
      return;

    this.retryCount++;
    const delayMs = Math.min(30_000, 2 ** Math.min(this.retryCount, 5) * 1_000);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket(symbol, generation);
    }, delayMs);
  }

  private toSnapshot(
    candle: Candle | null | undefined,
  ): BaseCandleSnapshot | null {
    if (!candle || typeof candle.Time !== 'string') return null;
    const time = parseUtcMs(candle.Time);
    if (!Number.isFinite(time)) return null;
    return {
      time,
      open: Number(candle.Open),
      high: Number(candle.High),
      low: Number(candle.Low),
      close: Number(candle.Close),
      volume: Number(candle.Volume ?? 0) || 0,
    };
  }

  private seedAggregator(
    symbol: string,
    requestSymbol: string,
    timeframe: string,
    generation: number,
  ): void {
    if (isOneMinuteTimeframe(timeframe)) {
      this.openSocket(symbol, generation);
      return;
    }

    const now = Date.now();
    const bucketStart = getTimeframeBucketStart(now, timeframe);
    const elapsedMinutes = Math.ceil((now - bucketStart) / 60_000);
    if (elapsedMinutes <= 0) {
      this.openSocket(symbol, generation);
      return;
    }

    // Large buckets (1d late in the day, 1w, 1M) would need tens of thousands
    // of 1m rows; seed from the target timeframe's own current candle instead.
    if (elapsedMinutes > MAX_ONE_MINUTE_SEED_CANDLES) {
      this.seedFromTargetTimeframe(
        symbol,
        requestSymbol,
        timeframe,
        bucketStart,
        generation,
      );
      return;
    }

    const isStale = (): boolean =>
      generation !== this.connectionGeneration ||
      this.activeSymbol !== symbol ||
      this.activeTimeframe !== timeframe;

    // Fetch a bit more than the elapsed minutes to absorb clock skew / backend lag.
    this.marketService
      .getCandles(requestSymbol, '1m', Math.max(3, elapsedMinutes + 5))
      .pipe(take(1))
      .subscribe({
        next: (candles) => {
          if (isStale()) return;

          const inBucket = (Array.isArray(candles) ? candles : [])
            .map((candle) => this.toSnapshot(candle))
            .filter(
              (candle): candle is BaseCandleSnapshot =>
                !!candle && candle.time >= bucketStart,
            );

          if (inBucket.length) {
            this.aggregator.seed(timeframe, inBucket);
            this.openSocket(symbol, generation);
            return;
          }

          // 1m history didn't cover the current bucket (cold start / backend lag):
          // fall back to the target timeframe's own in-progress candle for the true open.
          this.seedFromTargetTimeframe(
            symbol,
            requestSymbol,
            timeframe,
            bucketStart,
            generation,
          );
        },
        error: () => {
          if (isStale()) return;
          this.seedFromTargetTimeframe(
            symbol,
            requestSymbol,
            timeframe,
            bucketStart,
            generation,
          );
        },
      });
  }

  private seedFromTargetTimeframe(
    symbol: string,
    requestSymbol: string,
    timeframe: string,
    bucketStart: number,
    generation: number,
  ): void {
    const isStale = (): boolean =>
      generation !== this.connectionGeneration ||
      this.activeSymbol !== symbol ||
      this.activeTimeframe !== timeframe;

    this.marketService
      .getCandles(requestSymbol, timeframe, 2)
      .pipe(take(1))
      .subscribe({
        next: (candles) => {
          if (isStale()) return;

          const current = (Array.isArray(candles) ? candles : [])
            .map((candle) => this.toSnapshot(candle))
            .find(
              (candle): candle is BaseCandleSnapshot =>
                !!candle &&
                getTimeframeBucketStart(candle.time, timeframe) === bucketStart,
            );
          if (current) {
            this.aggregator.seedBucket(timeframe, {
              ...current,
              time: bucketStart,
            });
          }

          this.openSocket(symbol, generation);
        },
        error: () => {
          if (isStale()) return;
          this.openSocket(symbol, generation);
        },
      });
  }
}
