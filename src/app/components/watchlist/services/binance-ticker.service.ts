import { Injectable, inject, NgZone } from '@angular/core';
import { Subject, Observable } from 'rxjs';

export interface TickerUpdate {
  symbol: string;
  close: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;    // absolute price change
  changePct: number; // percentage change
}

/**
 * Binance mini-ticker WebSocket service for real-time price updates.
 * Subscribes only to the requested symbols via combined streams,
 * similar to how the chart subscribes to individual kline streams.
 */
@Injectable({ providedIn: 'root' })
export class BinanceTickerService {
  private zone = inject(NgZone);
  private ws: WebSocket | null = null;
  private tickers$ = new Subject<Map<string, TickerUpdate>>();
  private connected = false;
  private activeSymbols: string[] = [];

  /** Latest ticker snapshot (keyed by uppercase symbol) */
  private latestMap = new Map<string, TickerUpdate>();

  /**
   * Connect to Binance WebSocket for the given symbols.
   * Filters out non-Binance symbols (e.g. DOMINANCE).
   * If already connected with the same symbols, returns the existing observable.
   */
  connect(symbols: string[]): Observable<Map<string, TickerUpdate>> {
    const filtered = symbols
      .map(s => s.toUpperCase().trim())
      .filter(s => s && !s.includes('DOMINANCE'));

    // Already connected with same symbols — noop
    if (this.connected && this.ws?.readyState === WebSocket.OPEN &&
        filtered.length === this.activeSymbols.length &&
        filtered.every(s => this.activeSymbols.includes(s))) {
      return this.tickers$.asObservable();
    }

    this.activeSymbols = filtered;

    if (this.activeSymbols.length === 0) {
      this.disconnect();
      return this.tickers$.asObservable();
    }

    this.disconnect();
    this.openSocket();
    return this.tickers$.asObservable();
  }

  getLatest(): Map<string, TickerUpdate> {
    return this.latestMap;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  private openSocket(): void {
    if (this.activeSymbols.length === 0) return;
    this.connected = true;

    // Run outside Angular zone — no CD on each WS message
    this.zone.runOutsideAngular(() => {
      const streams = this.activeSymbols
        .map(s => `${s.toLowerCase()}@miniTicker`)
        .join('/');
      const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

      console.log('[BinanceTickerService] Connecting to', this.activeSymbols.length, 'symbols');
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[BinanceTickerService] Connected');
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          // Combined stream format: { stream: "btcusdt@miniTicker", data: { ... } }
          const t = msg?.data;
          if (!t?.s) return;

          const close = parseFloat(t.c);
          const open = parseFloat(t.o);
          const change = close - open;
          const changePct = open !== 0 ? (change / open) * 100 : 0;

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

          this.tickers$.next(this.latestMap);
        } catch { /* ignore parse errors */ }
      };

      this.ws.onerror = () => {
        console.warn('[BinanceTickerService] WebSocket error');
      };

      this.ws.onclose = () => {
        this.connected = false;
        // Auto-reconnect after 3s
        setTimeout(() => {
          if (!this.connected && this.activeSymbols.length > 0) {
            console.log('[BinanceTickerService] Reconnecting...');
            this.openSocket();
          }
        }, 3000);
      };
    });
  }
}
