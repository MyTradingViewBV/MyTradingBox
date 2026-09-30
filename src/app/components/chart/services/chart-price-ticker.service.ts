import { Injectable, NgZone, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {
  binanceCombinedStreamUrl,
  binanceMarketForExchange,
  DEFAULT_BINANCE_EXCHANGE_ID,
  sanitizeStreamSymbol,
} from '../utils/binance-market';

export interface ChartPriceTickerUpdate {
  symbol: string;
  price: number;
}

export function parseChartPriceTickerMessage(
  messageData: string,
): ChartPriceTickerUpdate | null {
  try {
    const message = JSON.parse(messageData);
    const ticker = message?.data ?? message;
    const symbol = String(ticker?.s ?? '').toUpperCase();
    const price = Number(ticker?.c);
    if (!symbol || !Number.isFinite(price)) return null;
    return { symbol, price };
  } catch {
    return null;
  }
}

@Injectable()
export class ChartPriceTickerService {
  private readonly zone = inject(NgZone);
  private readonly updatesSubject = new Subject<ChartPriceTickerUpdate>();
  private socket: WebSocket | null = null;
  private activeSymbol = '';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionGeneration = 0;
  private retryCount = 0;
  private activeExchangeId = DEFAULT_BINANCE_EXCHANGE_ID;

  /**
   * Stream the Binance mini-ticker for `symbol`. `exchangeId` (optional,
   * defaults to 2 = Binance) selects spot vs futures via binance-market.ts;
   * both Binance ids currently map to USDT-M futures, matching chart candles.
   */
  connect(
    symbol: string,
    exchangeId: number = DEFAULT_BINANCE_EXCHANGE_ID,
  ): Observable<ChartPriceTickerUpdate> {
    this.disconnect();
    const upper = (symbol || '').toUpperCase().trim();
    if (!upper || upper.includes('DOMINANCE')) {
      return this.updatesSubject.asObservable();
    }
    const normalizedSymbol = sanitizeStreamSymbol(upper, 'ChartPriceTicker');
    if (!normalizedSymbol) {
      return this.updatesSubject.asObservable();
    }

    this.activeSymbol = normalizedSymbol;
    this.activeExchangeId = exchangeId;
    const generation = this.connectionGeneration;
    this.openSocket(normalizedSymbol, generation);
    return this.updatesSubject.asObservable();
  }

  disconnect(): void {
    this.connectionGeneration++;
    this.activeSymbol = '';
    this.retryCount = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
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

  private openSocket(symbol: string, generation: number): void {
    if (
      generation !== this.connectionGeneration ||
      this.activeSymbol !== symbol
    )
      return;

    this.zone.runOutsideAngular(() => {
      const market = binanceMarketForExchange(this.activeExchangeId);
      const socket = new WebSocket(
        binanceCombinedStreamUrl(market, [
          `${symbol.toLowerCase()}@miniTicker`,
        ]),
      );
      this.socket = socket;

      socket.onopen = () => {
        if (this.stableTimer) clearTimeout(this.stableTimer);
        this.stableTimer = setTimeout(() => {
          this.stableTimer = null;
          if (this.socket === socket) this.retryCount = 0;
        }, 10_000);
      };

      socket.onmessage = (event: MessageEvent) => {
        const update = parseChartPriceTickerMessage(event.data);
        if (
          update &&
          update.symbol === this.activeSymbol &&
          generation === this.connectionGeneration
        ) {
          this.updatesSubject.next(update);
        }
      };

      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (this.socket !== socket) return;
        this.socket = null;
        if (this.stableTimer) {
          clearTimeout(this.stableTimer);
          this.stableTimer = null;
        }
        if (
          generation !== this.connectionGeneration ||
          this.activeSymbol !== symbol
        )
          return;
        this.retryCount++;
        const delayMs = Math.min(
          30_000,
          2 ** Math.min(this.retryCount, 5) * 1_000,
        );
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.openSocket(symbol, generation);
        }, delayMs);
      };
    });
  }
}
