import { Injectable, inject, DestroyRef, NgZone } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
 * Uses the combined stream !miniTicker@arr which pushes all symbol tickers every ~1s.
 * Lightweight alternative to individual kline streams for watchlist use.
 */
@Injectable({ providedIn: 'root' })
export class BinanceTickerService {
  private destroy$ = inject(DestroyRef);
  private zone = inject(NgZone);
  private ws: WebSocket | null = null;
  private tickers$ = new Subject<Map<string, TickerUpdate>>();
  private connected = false;

  /** Latest ticker snapshot (keyed by uppercase symbol) */
  private latestMap = new Map<string, TickerUpdate>();

  connect(): Observable<Map<string, TickerUpdate>> {
    if (!this.connected) {
      this.openSocket();
    }
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
    this.connected = true;

    // Run outside Angular zone — no CD on each WS message
    this.zone.runOutsideAngular(() => {
      const url = 'wss://stream.binance.com:9443/ws/!ticker@arr';
      this.ws = new WebSocket(url);

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const arr: BinanceMiniTicker[] = JSON.parse(event.data);
          if (!Array.isArray(arr)) return;

          for (const t of arr) {
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
          }

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
          if (!this.connected) this.openSocket();
        }, 3000);
      };
    });
  }
}

/** Raw Binance 24hr ticker array item */
interface BinanceMiniTicker {
  e: string;  // "24hrTicker"
  s: string;  // Symbol
  c: string;  // Close price
  o: string;  // Open price
  h: string;  // High price
  l: string;  // Low price
  v: string;  // Base volume
  q: string;  // Quote volume
}
