import { Injectable, NgZone, inject } from '@angular/core';
import { Observable, Subject, take } from 'rxjs';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import {
  BaseCandleSnapshot,
  LiveCandleUpdate,
} from '../models/live-candle-update';
import { parseUtcMs } from '../utils/merge-live-candles';
import { SymbolCandleAggregator } from '../utils/symbol-candle-aggregator';
import {
  getTimeframeBucketStart,
  isOneMinuteTimeframe,
  normalizeTimeframe,
  parseTimeframeMinutes,
} from '../utils/timeframe-bucketing';

export interface ExchangeCandleStreamService {
  readonly exchangeName: string;
  connectKlineStream(symbol: string, timeframe: string): Observable<LiveCandleUpdate>;
  disconnect(): void;
}

export interface ParsedStreamCandle {
  symbol: string;
  candle: BaseCandleSnapshot;
  isClosed: boolean;
}

@Injectable()
export abstract class BrowserExchangeCandleStreamService
  implements ExchangeCandleStreamService
{
  abstract readonly exchangeName: string;

  private readonly zone = inject(NgZone);
  private readonly marketService = inject(ChartService);
  private readonly updatesSubject = new Subject<LiveCandleUpdate>();
  private readonly pendingBySymbol = new Map<string, BaseCandleSnapshot>();

  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionGeneration = 0;
  private activeSymbol = '';
  private activeTimeframe = '';
  private retryCount = 0;
  private aggregator = new SymbolCandleAggregator();

  connectKlineStream(
    symbol: string,
    timeframe: string,
  ): Observable<LiveCandleUpdate> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframe(timeframe);
    this.disconnect();

    if (!normalizedSymbol || !normalizedTimeframe) {
      return this.updatesSubject.asObservable();
    }

    this.activeSymbol = normalizedSymbol;
    this.activeTimeframe = normalizedTimeframe;
    this.aggregator = new SymbolCandleAggregator();

    this.seedAggregator(normalizedSymbol, normalizedTimeframe);
    const generation = this.connectionGeneration;
    this.openSocket(normalizedSymbol, generation);

    return this.updatesSubject.asObservable();
  }

  disconnect(): void {
    this.connectionGeneration++;
    this.activeSymbol = '';
    this.activeTimeframe = '';
    this.retryCount = 0;
    this.pendingBySymbol.clear();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }
  }

  protected normalizeSymbol(symbol: string): string {
    return (symbol || '').toUpperCase().trim();
  }

  protected abstract getSocketUrl(symbol: string): string;

  protected getSubscribeMessage(_symbol: string): unknown | null {
    return null;
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

  private openSocket(symbol: string, generation: number): void {
    if (generation !== this.connectionGeneration || this.activeSymbol !== symbol) return;

    this.zone.runOutsideAngular(() => {
      const socket = new WebSocket(this.getSocketUrl(symbol));
      this.socket = socket;

      socket.onopen = () => {
        this.retryCount = 0;
        const subscribeMessage = this.getSubscribeMessage(symbol);
        if (subscribeMessage) {
          socket.send(JSON.stringify(subscribeMessage));
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
        if (this.socket === socket) this.socket = null;
        this.scheduleReconnect(symbol, generation);
      };
    });
  }

  private handleParsedCandle(parsed: ParsedStreamCandle): void {
    if (!this.activeSymbol || !this.activeTimeframe) return;
    if (this.normalizeSymbol(parsed.symbol) !== this.activeSymbol) return;

    const updates = this.aggregator.update(
      this.activeSymbol,
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
    if (generation !== this.connectionGeneration || this.activeSymbol !== symbol) return;

    this.retryCount++;
    const delayMs = Math.min(30_000, 2 ** Math.min(this.retryCount, 5) * 1_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket(symbol, generation);
    }, delayMs);
  }

  private seedAggregator(symbol: string, timeframe: string): void {
    if (isOneMinuteTimeframe(timeframe)) return;

    const bucketStart = getTimeframeBucketStart(Date.now(), timeframe);
    const elapsedMinutes = Math.ceil((Date.now() - bucketStart) / 60_000);
    if (elapsedMinutes <= 0) return;

    this.marketService
      .getCandles(symbol, '1m', Math.max(3, elapsedMinutes + 1))
      .pipe(take(1))
      .subscribe({
        next: (candles) => {
          const closedInBucket = (candles || [])
            .map((candle) => ({
              time: parseUtcMs(candle.Time),
              open: candle.Open,
              high: candle.High,
              low: candle.Low,
              close: candle.Close,
              volume: candle.Volume ?? 0,
            }))
            .filter((candle) => candle.time >= bucketStart)
            .filter((candle) => Number.isFinite(candle.time));
          this.aggregator.seed(timeframe, closedInBucket);
        },
      });
  }

  protected baseCloseTime(candle: BaseCandleSnapshot): number {
    return candle.time + parseTimeframeMinutes('1m') * 60_000;
  }
}
