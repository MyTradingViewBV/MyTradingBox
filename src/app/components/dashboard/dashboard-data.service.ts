import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, shareReplay, switchMap, take } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { BoxModel } from 'src/app/modules/shared/models/chart/boxModel.dto';
import { Candle } from 'src/app/modules/shared/models/chart/candle.dto';
import { WatchlistDTO } from 'src/app/modules/shared/models/watchlist/watchlist.dto';
import {
  CalendarEvent,
  DASHBOARD_TIMEFRAMES,
} from './dashboard-stats';

export interface MarketMood {
  fearGreed: { value: number; label: string } | null;
  btcDominance: number | null;
}

const FEAR_GREED_URL = 'https://api.alternative.me/fng/?limit=1';
const COINGECKO_GLOBAL_URL = 'https://api.coingecko.com/api/v3/global';
/** Public sources are rate limited; one fetch per 10 minutes is plenty. */
const MOOD_CACHE_MS = 10 * 60 * 1000;

/**
 * Data for the Dashboard page. Only existing API endpoints are used; every
 * call falls back to an empty value so one failing source never breaks the page.
 */
@Injectable({ providedIn: 'root' })
export class DashboardDataService {
  private readonly _http = inject(HttpClient);
  private readonly _chart = inject(ChartService);
  private readonly _settings = inject(SettingsService);
  private readonly _base = environment.apiUrl;
  private _mood$: Observable<MarketMood> | null = null;
  private _moodAt = 0;

  candles(symbol: string, timeframe: string, limit: number): Observable<Candle[]> {
    return this._chart.getCandles(symbol, timeframe, limit).pipe(
      map((rows) => (Array.isArray(rows) ? rows : [])),
      catchError(() => of([] as Candle[])),
    );
  }

  /** Box lists for every chart timeframe of one symbol (10 calls). */
  boxesPerTimeframe(symbol: string): Observable<Record<string, BoxModel[]>> {
    const calls = DASHBOARD_TIMEFRAMES.map((tf) =>
      this._once(() => this._chart.getBoxes(symbol, tf)).pipe(
        map((rows) => (Array.isArray(rows) ? rows : [])),
        catchError(() => of([] as BoxModel[])),
      ),
    );
    return forkJoin(calls).pipe(
      map((lists) =>
        Object.fromEntries(DASHBOARD_TIMEFRAMES.map((tf, i) => [tf, lists[i]])),
      ),
    );
  }

  watchlist(): Observable<WatchlistDTO[] | null> {
    return this._once(() => this._chart.getWatchlist()).pipe(
      map((rows) => (Array.isArray(rows) ? rows : [])),
      catchError(() => of(null)),
    );
  }

  /** Number of items waiting in the AI queue, or null when unavailable. */
  aiQueueCount(): Observable<number | null> {
    return this._withExchange((exchangeId) =>
      this._http.get<unknown[]>(`${this._base}AiQueue?exchangeId=${exchangeId}`),
    ).pipe(
      map((rows) => (Array.isArray(rows) ? rows.length : null)),
      catchError(() => of(null)),
    );
  }

  /** Pending push notifications. The endpoint is admin-only: call it for admins only. */
  pendingNotifications(): Observable<number | null> {
    return this._withExchange((exchangeId) =>
      this._http.get<unknown[]>(`${this._base}api/NotificationQueue/pending`, {
        params: new HttpParams().set('exchangeId', exchangeId).set('limit', 500),
      }),
    ).pipe(
      map((rows) => (Array.isArray(rows) ? rows.length : null)),
      catchError(() => of(null)),
    );
  }

  /**
   * The month's calendar events; the overview picks today's. The API's fromDate/toDate filter
   * answers 500 (without CORS headers), so everything is fetched, like the chart's news overlay.
   */
  calendarToday(): Observable<CalendarEvent[]> {
    return this._chart.getForexCalendarEvents();
  }

  /** Fear & Greed (alternative.me) and BTC dominance (CoinGecko), cached for 10 minutes. */
  marketMood(): Observable<MarketMood> {
    if (!this._mood$ || Date.now() - this._moodAt > MOOD_CACHE_MS) {
      this._moodAt = Date.now();
      this._mood$ = forkJoin({
        fearGreed: this._http
          .get<{ data?: { value?: string; value_classification?: string }[] }>(FEAR_GREED_URL)
          .pipe(
            map((r) => {
              const row = r?.data?.[0];
              const value = Number(row?.value);
              return Number.isFinite(value) && row
                ? { value, label: row.value_classification ?? '' }
                : null;
            }),
            catchError(() => of(null)),
          ),
        btcDominance: this._http
          .get<{ data?: { market_cap_percentage?: { btc?: number } } }>(COINGECKO_GLOBAL_URL)
          .pipe(
            map((r) => {
              const btc = r?.data?.market_cap_percentage?.btc;
              return typeof btc === 'number' && Number.isFinite(btc) ? btc : null;
            }),
            catchError(() => of(null)),
          ),
      }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this._mood$;
  }

  /** Symbols with collected boxes, for the timeframe tab's picker. */
  symbols(): Observable<string[]> {
    return this._once(() => this._chart.getSymbols()).pipe(
      map((rows) => (rows ?? []).map((s) => s.SymbolName).filter(Boolean).sort()),
      catchError(() => of([] as string[])),
    );
  }

  /**
   * ChartService calls follow the selected exchange and never complete. Wait
   * until the exchange is known (no fallback Id) and take a single answer.
   */
  private _once<T>(call: () => Observable<T>): Observable<T> {
    return this._settings.waitForExchangeId$().pipe(switchMap(() => call().pipe(take(1))));
  }

  private _withExchange<T>(call: (exchangeId: number) => Observable<T>): Observable<T> {
    return this._settings.waitForExchangeId$().pipe(switchMap(call));
  }
}
