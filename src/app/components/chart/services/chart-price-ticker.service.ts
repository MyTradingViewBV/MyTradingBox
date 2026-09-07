import { Injectable, NgZone, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';

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
  private connectionGeneration = 0;

  connect(symbol: string): Observable<ChartPriceTickerUpdate> {
    const normalizedSymbol = (symbol || '').toUpperCase().trim();
    this.disconnect();
    if (!normalizedSymbol || normalizedSymbol.includes('DOMINANCE')) {
      return this.updatesSubject.asObservable();
    }

    this.activeSymbol = normalizedSymbol;
    const generation = this.connectionGeneration;
    this.openSocket(normalizedSymbol, generation);
    return this.updatesSubject.asObservable();
  }

  disconnect(): void {
    this.connectionGeneration++;
    this.activeSymbol = '';
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

  private openSocket(symbol: string, generation: number): void {
    if (generation !== this.connectionGeneration || this.activeSymbol !== symbol) return;

    this.zone.runOutsideAngular(() => {
      const stream = `${symbol.toLowerCase()}@miniTicker`;
      const socket = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
      this.socket = socket;

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
        if (this.socket === socket) this.socket = null;
        if (generation !== this.connectionGeneration || this.activeSymbol !== symbol) return;
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.openSocket(symbol, generation);
        }, 3000);
      };
    });
  }
}
