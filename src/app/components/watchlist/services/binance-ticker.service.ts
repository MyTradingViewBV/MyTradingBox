import { Injectable, inject, NgZone } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import {
  binanceMarketForExchange,
  binanceMiniTickerUrl,
  BinanceMarket,
  DEFAULT_BINANCE_EXCHANGE_ID,
  sanitizeStreamSymbol,
} from '../../chart/utils/binance-market';
import { STABLE_CONNECTION_MS } from '../../chart/services/exchange-candle-stream.service';

export interface TickerUpdate {
  symbol: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number; // absolute price change
  changePct: number; // percentage change
}

const EMIT_INTERVAL_MS = 300;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Binance mini-ticker WebSocket service for real-time price updates.
 * Subscribes only to the requested symbols via combined streams,
 * similar to how the chart subscribes to individual kline streams.
 * Spot vs futures follows binance-market.ts (Binance ids map to USDT-M futures).
 */
@Injectable({ providedIn: 'root' })
export class BinanceTickerService {
  private zone = inject(NgZone);
  private ws: WebSocket | null = null;
  private tickers$ = new Subject<Map<string, TickerUpdate>>();
  private activeSymbols: string[] = [];
  private market: BinanceMarket = binanceMarketForExchange(
    DEFAULT_BINANCE_EXCHANGE_ID,
  );
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  /** Resets the backoff only once a socket has stayed open for STABLE_CONNECTION_MS. */
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;

  /** Latest ticker snapshot (keyed by uppercase symbol) */
  private latestMap = new Map<string, TickerUpdate>();

  /**
   * Connect to Binance WebSocket for the given symbols.
   * Filters out non-Binance symbols (e.g. DOMINANCE) and symbols that are not
   * safe to embed in a stream URL. `exchangeId` (optional, default 2) selects
   * the Binance market. If already connected with the same symbols, returns
   * the existing observable.
   */
  connect(
    symbols: string[],
    exchangeId: number = DEFAULT_BINANCE_EXCHANGE_ID,
  ): Observable<Map<string, TickerUpdate>> {
    const filtered = [
      ...new Set(
        (symbols || [])
          .map((s) => (s || '').toUpperCase().trim())
          .filter((s) => s && !s.includes('DOMINANCE'))
          .map((s) => sanitizeStreamSymbol(s, 'BinanceTickerService'))
          .filter((s): s is string => !!s),
      ),
    ];
    const market = binanceMarketForExchange(exchangeId);

    // Already connected with same symbols: noop
    if (
      this.ws?.readyState === WebSocket.OPEN &&
      market === this.market &&
      filtered.length === this.activeSymbols.length &&
      filtered.every((s) => this.activeSymbols.includes(s))
    ) {
      return this.tickers$.asObservable();
    }

    this.disconnect();
    this.activeSymbols = filtered;
    this.market = market;

    if (this.activeSymbols.length > 0) {
      this.openSocket();
    }
    return this.tickers$.asObservable();
  }

  getLatest(): Map<string, TickerUpdate> {
    return this.latestMap;
  }

  /** Stop streaming; never reconnects until `connect()` is called again. */
  disconnect(): void {
    this.activeSymbols = [];
    this.retryCount = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearStableTimer();
    if (this.ws) {
      const socket = this.ws;
      this.ws = null;
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    }
  }

  private clearStableTimer(): void {
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.tickers$.next(this.latestMap);
    }, EMIT_INTERVAL_MS);
  }

  private openSocket(): void {
    if (this.activeSymbols.length === 0) return;

    // Run outside Angular zone: no CD on each WS message
    this.zone.runOutsideAngular(() => {
      const url = binanceMiniTickerUrl(this.market, this.activeSymbols);
      const socket = new WebSocket(url);
      this.ws = socket;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        // Reset the backoff only after the socket stayed open for a while, so a
        // flapping connection keeps backing off instead of retrying every ~1s.
        this.clearStableTimer();
        this.stableTimer = setTimeout(() => {
          this.stableTimer = null;
          if (this.ws === socket) this.retryCount = 0;
        }, STABLE_CONNECTION_MS);
      };

      socket.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          // Combined stream format: { stream: "btcusdt@miniTicker", data: { ... } }
          const t = msg?.data;
          if (!t?.s) return;

          const close = parseFloat(t.c);
          const open = parseFloat(t.o);
          if (!Number.isFinite(close)) return;
          const change = close - open;
          const changePct =
            open !== 0 && Number.isFinite(open) ? (change / open) * 100 : 0;

          this.latestMap.set(t.s, {
            symbol: t.s,
            close,
            open,
            high: parseFloat(t.h),
            low: parseFloat(t.l),
            volume: parseFloat(t.v),
            change,
            changePct,
          });

          this.scheduleEmit();
        } catch {
          /* ignore parse errors */
        }
      };

      socket.onerror = () => {
        console.warn('[BinanceTickerService] WebSocket error');
      };

      socket.onclose = () => {
        if (this.ws !== socket) return;
        this.ws = null;
        this.clearStableTimer();
        if (this.activeSymbols.length === 0) return;
        this.retryCount++;
        const delayMs = Math.min(
          RECONNECT_MAX_MS,
          RECONNECT_BASE_MS * 2 ** Math.min(this.retryCount - 1, 5),
        );
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          if (!this.ws && this.activeSymbols.length > 0) {
            this.openSocket();
          }
        }, delayMs);
      };
    });
  }
}
