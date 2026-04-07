import { Injectable, NgZone, inject } from '@angular/core';
import { Observable, Subject, Subscription, catchError, forkJoin, of, switchMap, timer } from 'rxjs';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';

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

@Injectable({ providedIn: 'root' })
export class ExchangeTickerFactoryService {
  private readonly zone = inject(NgZone);
  private readonly chartService = inject(ChartService);

  private readonly tickers$ = new Subject<Map<TickerKey, TickerUpdate>>();
  private latestMap = new Map<TickerKey, TickerUpdate>();

  private binanceWs: WebSocket | null = null;
  private binanceSymbols: string[] = [];

  private pollerSub?: Subscription;
  private pollTargets: ExchangeTickerInput[] = [];

  private connectedSignature = '';

  connect(inputs: ExchangeTickerInput[]): Observable<Map<TickerKey, TickerUpdate>> {
    const normalized = this.normalizeInputs(inputs);
    const nextSignature = this.signatureFor(normalized);

    if (nextSignature === this.connectedSignature) {
      return this.tickers$.asObservable();
    }

    this.connectedSignature = nextSignature;

    const binanceTargets = normalized
      .filter((x) => x.exchangeId === 2 && !x.symbol.includes('DOMINANCE'))
      .map((x) => x.symbol);

    this.pollTargets = normalized.filter((x) => x.exchangeId !== 2 || x.symbol.includes('DOMINANCE'));

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
    if (this.binanceWs) {
      this.binanceWs.close();
      this.binanceWs = null;
    }
    this.pollerSub?.unsubscribe();
    this.pollerSub = undefined;
  }

  key(exchangeId: number, symbol: string): TickerKey {
    return `${exchangeId}:${(symbol || '').toUpperCase().trim()}`;
  }

  private normalizeInputs(inputs: ExchangeTickerInput[]): ExchangeTickerInput[] {
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

  private configureBinanceSocket(symbols: string[]): void {
    const next = [...new Set(symbols)].sort();
    const sameSet =
      next.length === this.binanceSymbols.length &&
      next.every((s, idx) => s === this.binanceSymbols[idx]);

    if (sameSet && this.binanceWs?.readyState === WebSocket.OPEN) {
      return;
    }

    this.binanceSymbols = next;

    if (this.binanceWs) {
      this.binanceWs.close();
      this.binanceWs = null;
    }

    if (!this.binanceSymbols.length) {
      return;
    }

    this.zone.runOutsideAngular(() => {
      const streams = this.binanceSymbols
        .map((s) => `${s.toLowerCase()}@miniTicker`)
        .join('/');
      const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

      this.binanceWs = new WebSocket(url);

      this.binanceWs.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          const t = msg?.data;
          if (!t?.s) return;

          const close = parseFloat(t.c);
          const open = parseFloat(t.o);
          const high = parseFloat(t.h);
          const low = parseFloat(t.l);
          const volume = parseFloat(t.v);
          const change = close - open;
          const changePct = open !== 0 ? (change / open) * 100 : 0;

          const symbol = String(t.s).toUpperCase();
          this.latestMap.set(this.key(2, symbol), {
            symbol,
            close,
            open,
            high,
            low,
            volume,
            change,
            changePct,
          });

          this.tickers$.next(this.latestMap);
        } catch {
          // Ignore malformed messages.
        }
      };

      this.binanceWs.onclose = () => {
        if (!this.binanceSymbols.length) return;
        setTimeout(() => {
          if (this.binanceSymbols.length && !this.binanceWs) {
            this.configureBinanceSocket(this.binanceSymbols);
          }
        }, 3000);
      };
    });
  }

  private configurePoller(): void {
    this.pollerSub?.unsubscribe();
    this.pollerSub = undefined;

    if (!this.pollTargets.length) {
      return;
    }

    this.pollerSub = timer(0, 5000)
      .pipe(
        switchMap(() =>
          forkJoin(
            this.pollTargets.map((target) =>
              this.chartService
                .getLiveCandleForExchange(target.exchangeId, target.symbol, '1m')
                .pipe(catchError(() => of(null))),
            ),
          ),
        ),
      )
      .subscribe((results: any[]) => {
        for (let i = 0; i < this.pollTargets.length; i++) {
          const target = this.pollTargets[i];
          const payload = results[i];
          const ticker = this.toTickerUpdate(target.symbol, payload);
          if (!ticker) continue;

          this.latestMap.set(this.key(target.exchangeId, target.symbol), ticker);
        }

        this.tickers$.next(this.latestMap);
      });
  }

  private toTickerUpdate(symbol: string, payload: any): TickerUpdate | null {
    const sample = Array.isArray(payload)
      ? payload[payload.length - 1]
      : payload;
    if (!sample || typeof sample !== 'object') return null;

    const close = this.readNumber(sample, ['close', 'Close', 'c', 'price', 'Price']);
    if (!Number.isFinite(close)) return null;

    const open = this.readNumber(sample, ['open', 'Open', 'o'], close);
    const high = this.readNumber(sample, ['high', 'High', 'h'], close);
    const low = this.readNumber(sample, ['low', 'Low', 'l'], close);
    const volume = this.readNumber(sample, ['volume', 'Volume', 'v'], 0);

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

  private readNumber(obj: any, keys: string[], fallback = NaN): number {
    for (const key of keys) {
      const value = Number(obj?.[key]);
      if (Number.isFinite(value)) return value;
    }
    return fallback;
  }
}
