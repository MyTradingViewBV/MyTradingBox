import { Injectable, NgZone, inject } from '@angular/core';
import {
  Observable,
  Subject,
  Subscription,
  catchError,
  forkJoin,
  map,
  of,
  switchMap,
  timer,
} from 'rxjs';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import {
  binanceMarketForExchange,
  binanceMiniTickerUrl,
  BinanceMarket,
  isBinanceExchangeId,
  sanitizeStreamSymbol,
} from '../../chart/utils/binance-market';

export interface TickerUpdate {
  symbol: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePct: number;
}

export interface ExchangeTickerInput {
  exchangeId: number;
  symbol: string;
}

type TickerKey = string;

/** Minimum spacing between `tickers$` emissions (message bursts are coalesced). */
export const TICKER_EMIT_INTERVAL_MS = 300;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const POLL_INTERVAL_MS = 5_000;
/** How long a non-Binance 24h reference (daily open) is reused before refetching. */
const DAILY_REFERENCE_TTL_MS = 10 * 60_000;

interface DailyReference {
  open: number;
  high: number;
  low: number;
  volume: number;
  fetchedAt: number;
}

@Injectable({ providedIn: 'root' })
export class ExchangeTickerFactoryService {
  private readonly zone = inject(NgZone);
  private readonly chartService = inject(ChartService);

  private readonly tickers$ = new Subject<Map<TickerKey, TickerUpdate>>();
  private latestMap = new Map<TickerKey, TickerUpdate>();

  private binanceWs: WebSocket | null = null;
  private binanceSymbols: string[] = [];
  /** Uppercase symbol -> Binance exchange ids (2 and/or 7) watching it. */
  private binanceExchangeIdsBySymbol = new Map<string, number[]>();
  private binanceMarket: BinanceMarket = 'futures';
  private binanceReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private binanceRetryCount = 0;

  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEmitAt = 0;

  private pollerSub?: Subscription;
  private pollTargets: ExchangeTickerInput[] = [];
  private readonly dailyReferences = new Map<TickerKey, DailyReference>();

  private connectedSignature = '';

  connect(
    inputs: ExchangeTickerInput[],
  ): Observable<Map<TickerKey, TickerUpdate>> {
    const normalized = this.normalizeInputs(inputs);
    const nextSignature = this.signatureFor(normalized);

    if (nextSignature === this.connectedSignature) {
      return this.tickers$.asObservable();
    }

    this.connectedSignature = nextSignature;

    const isStreamed = (x: ExchangeTickerInput): boolean =>
      isBinanceExchangeId(x.exchangeId) && !x.symbol.includes('DOMINANCE');

    const binanceTargets = normalized.filter(isStreamed);
    this.pollTargets = normalized.filter((x) => !isStreamed(x));

    this.configureBinanceSocket(binanceTargets);
    this.configurePoller();

    return this.tickers$.asObservable();
  }

  getLatest(): Map<TickerKey, TickerUpdate> {
    return this.latestMap;
  }

  disconnect(): void {
    this.connectedSignature = '';
    this.binanceSymbols = [];
    this.binanceExchangeIdsBySymbol.clear();
    this.closeBinanceSocket();
    this.pollerSub?.unsubscribe();
    this.pollerSub = undefined;
    if (this.emitTimer) {
      clearTimeout(this.emitTimer);
      this.emitTimer = null;
    }
  }

  key(exchangeId: number, symbol: string): TickerKey {
    return `${exchangeId}:${(symbol || '').toUpperCase().trim()}`;
  }

  private normalizeInputs(
    inputs: ExchangeTickerInput[],
  ): ExchangeTickerInput[] {
    const unique = new Map<string, ExchangeTickerInput>();
    for (const item of inputs || []) {
      const symbol = (item?.symbol || '').toUpperCase().trim();
      const exchangeId = Number(item?.exchangeId || 0);
      if (!symbol || exchangeId <= 0) continue;
      const k = `${exchangeId}:${symbol}`;
      if (!unique.has(k)) {
        unique.set(k, { exchangeId, symbol });
      }
    }
    return Array.from(unique.values());
  }

  private signatureFor(inputs: ExchangeTickerInput[]): string {
    return inputs
      .map((x) => `${x.exchangeId}:${x.symbol}`)
      .sort()
      .join('|');
  }

  /**
   * Coalesce emissions: state is written to `latestMap` immediately, but
   * subscribers are notified at most once per TICKER_EMIT_INTERVAL_MS.
   * Runs outside the Angular zone (subscribers re-enter it themselves).
   */
  private scheduleEmit(): void {
    if (this.emitTimer) return;
    const wait = Math.max(
      0,
      this.lastEmitAt + TICKER_EMIT_INTERVAL_MS - Date.now(),
    );
    this.zone.runOutsideAngular(() => {
      this.emitTimer = setTimeout(() => {
        this.emitTimer = null;
        this.lastEmitAt = Date.now();
        this.tickers$.next(this.latestMap);
      }, wait);
    });
  }

  private closeBinanceSocket(): void {
    if (this.binanceReconnectTimer) {
      clearTimeout(this.binanceReconnectTimer);
      this.binanceReconnectTimer = null;
    }
    const socket = this.binanceWs;
    this.binanceWs = null;
    if (socket) {
      // Detach first so an intentional close never schedules a reconnect.
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    }
  }

  private configureBinanceSocket(targets: ExchangeTickerInput[]): void {
    const idsBySymbol = new Map<string, number[]>();
    for (const target of targets) {
      const symbol = sanitizeStreamSymbol(
        target.symbol,
        'ExchangeTickerFactory',
      );
      if (!symbol) continue;
      const ids = idsBySymbol.get(symbol) ?? [];
      if (!ids.includes(target.exchangeId)) ids.push(target.exchangeId);
      idsBySymbol.set(symbol, ids);
    }
    this.binanceExchangeIdsBySymbol = idsBySymbol;

    const next = [...idsBySymbol.keys()].sort();
    const market = binanceMarketForExchange(targets[0]?.exchangeId);
    const sameSet =
      market === this.binanceMarket &&
      next.length === this.binanceSymbols.length &&
      next.every((s, idx) => s === this.binanceSymbols[idx]);

    if (
      sameSet &&
      this.binanceWs &&
      (this.binanceWs.readyState === WebSocket.OPEN ||
        this.binanceWs.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.binanceSymbols = next;
    this.binanceMarket = market;
    this.binanceRetryCount = 0;
    this.closeBinanceSocket();

    if (!this.binanceSymbols.length) {
      return;
    }

    this.openBinanceSocket();
  }

  private openBinanceSocket(): void {
    if (!this.binanceSymbols.length) return;

    this.zone.runOutsideAngular(() => {
      const socket = new WebSocket(
        binanceMiniTickerUrl(this.binanceMarket, this.binanceSymbols),
      );
      this.binanceWs = socket;

      socket.onopen = () => {
        if (this.binanceWs === socket) this.binanceRetryCount = 0;
      };

      socket.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          const t = msg?.data;
          if (!t?.s) return;

          const close = parseFloat(t.c);
          const open = parseFloat(t.o);
          const high = parseFloat(t.h);
          const low = parseFloat(t.l);
          const volume = parseFloat(t.v);
          if (!Number.isFinite(close)) return;
          const change = close - open;
          const changePct =
            open !== 0 && Number.isFinite(open) ? (change / open) * 100 : 0;

          const symbol = String(t.s).toUpperCase();
          const ids = this.binanceExchangeIdsBySymbol.get(symbol);
          if (!ids?.length) return;
          const update: TickerUpdate = {
            symbol,
            close,
            open,
            high,
            low,
            volume,
            change,
            changePct,
          };
          for (const exchangeId of ids) {
            this.latestMap.set(this.key(exchangeId, symbol), update);
          }

          this.scheduleEmit();
        } catch {
          // Ignore malformed messages.
        }
      };

      socket.onerror = () => socket.close();

      socket.onclose = () => {
        // Only the current socket may reconnect; replaced/closed sockets are ignored.
        if (this.binanceWs !== socket) return;
        this.binanceWs = null;
        if (!this.binanceSymbols.length) return;

        this.binanceRetryCount++;
        const delayMs = Math.min(
          RECONNECT_MAX_MS,
          RECONNECT_BASE_MS * 2 ** Math.min(this.binanceRetryCount - 1, 5),
        );
        this.binanceReconnectTimer = setTimeout(() => {
          this.binanceReconnectTimer = null;
          if (this.binanceSymbols.length && !this.binanceWs) {
            this.openBinanceSocket();
          }
        }, delayMs);
      };
    });
  }

  private configurePoller(): void {
    this.pollerSub?.unsubscribe();
    this.pollerSub = undefined;

    if (!this.pollTargets.length) {
      return;
    }

    const targets = this.pollTargets;
    this.pollerSub = timer(0, POLL_INTERVAL_MS)
      .pipe(
        switchMap(() =>
          forkJoin(
            targets.map((target) =>
              forkJoin({
                live: this.chartService
                  .getLiveCandleForExchange(
                    target.exchangeId,
                    target.symbol,
                    '1m',
                  )
                  .pipe(catchError(() => of(null))),
                daily: this.dailyReference$(target),
              }),
            ),
          ),
        ),
      )
      .subscribe((results) => {
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const { live, daily } = results[i];
          const ticker = this.toTickerUpdate(target.symbol, live, daily);
          if (!ticker) continue;

          this.latestMap.set(
            this.key(target.exchangeId, target.symbol),
            ticker,
          );
        }

        this.scheduleEmit();
      });
  }

  /**
   * 24h reference (daily candle open/high/low/volume) for non-Binance rows,
   * cached for DAILY_REFERENCE_TTL_MS so it is not refetched on every poll.
   * Binance rows use the mini-ticker's rolling 24h open; for other exchanges
   * the current UTC daily candle is the closest 24h reference the per-exchange
   * API offers. Resolves to null (falls back to the 1m open) on failure.
   */
  private dailyReference$(
    target: ExchangeTickerInput,
  ): Observable<DailyReference | null> {
    const cacheKey = this.key(target.exchangeId, target.symbol);
    const cached = this.dailyReferences.get(cacheKey);
    const now = Date.now();
    const cachedDay = cached ? Math.floor(cached.fetchedAt / 86_400_000) : NaN;
    if (
      cached &&
      now - cached.fetchedAt < DAILY_REFERENCE_TTL_MS &&
      cachedDay === Math.floor(now / 86_400_000)
    ) {
      return of(cached);
    }

    return this.chartService
      .getLiveCandleForExchange(target.exchangeId, target.symbol, '1d')
      .pipe(
        map((payload) => {
          const sample = Array.isArray(payload)
            ? payload[payload.length - 1]
            : payload;
          if (!sample || typeof sample !== 'object') return cached ?? null;
          const open = this.readNumber(sample, ['open', 'Open', 'o']);
          if (!Number.isFinite(open) || open <= 0) return cached ?? null;
          const reference: DailyReference = {
            open,
            high: this.readNumber(sample, ['high', 'High', 'h']),
            low: this.readNumber(sample, ['low', 'Low', 'l']),
            volume: this.readNumber(sample, ['volume', 'Volume', 'v'], 0),
            fetchedAt: now,
          };
          this.dailyReferences.set(cacheKey, reference);
          return reference;
        }),
        catchError(() => of(cached ?? null)),
      );
  }

  private toTickerUpdate(
    symbol: string,
    payload: unknown,
    daily: DailyReference | null = null,
  ): TickerUpdate | null {
    const sample = Array.isArray(payload)
      ? payload[payload.length - 1]
      : payload;
    if (!sample || typeof sample !== 'object') return null;

    const close = this.readNumber(sample, [
      'close',
      'Close',
      'c',
      'price',
      'Price',
    ]);
    if (!Number.isFinite(close)) return null;

    const minuteOpen = this.readNumber(sample, ['open', 'Open', 'o'], close);
    const open = daily?.open ?? minuteOpen;
    const high = Math.max(
      this.readNumber(sample, ['high', 'High', 'h'], close),
      Number.isFinite(daily?.high) ? (daily?.high as number) : -Infinity,
      close,
    );
    const low = Math.min(
      this.readNumber(sample, ['low', 'Low', 'l'], close),
      Number.isFinite(daily?.low) ? (daily?.low as number) : Infinity,
      close,
    );
    const volume = daily
      ? daily.volume
      : this.readNumber(sample, ['volume', 'Volume', 'v'], 0);

    const change = close - open;
    const changePct = open !== 0 ? (change / open) * 100 : 0;

    return {
      symbol,
      close,
      open,
      high,
      low,
      volume,
      change,
      changePct,
    };
  }

  private readNumber(obj: unknown, keys: string[], fallback = NaN): number {
    const record = obj as Record<string, unknown> | null | undefined;
    for (const key of keys) {
      const value = Number(record?.[key]);
      if (Number.isFinite(value)) return value;
    }
    return fallback;
  }
}
