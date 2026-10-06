import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, switchMap, map, catchError, of } from 'rxjs';
import { environment } from '../../../../../environments/environment';
import { jwtDecode } from 'jwt-decode';
import { BoxModel } from '../../models/chart/boxModel.dto';
import { Candle } from '../../models/chart/candle.dto';
import { EmaMmaLevel } from '../../models/chart/emaMmaLevel.dto';
import { FibLevel } from '../../models/chart/fibLevel.dto';
import { KeyZonesModel } from '../../models/chart/keyZones.dto';
import { SymbolModel } from '../../models/chart/symbol.dto';
import { VolumeProfile } from '../../models/chart/volumeProfile.dto';
import { SettingsService } from '../services/settingsService';
import { Exchange } from '../../models/orders/exchange.dto';
import { TradePlanModel } from '../../models/orders/tradeOrders.dto';
import { WatchlistDTO } from '../../models/watchlist/watchlist.dto';
import { OrderModel } from '../../models/orders/order.dto';
import { CapitalFlowSignal } from '../../../../components/chart/models/capital-flow-signal';
import { ChartStateDto } from '../../models/chart/chart-state.dto';
import { MarketCipherSignal } from '../../models/chart/market-cipher-signal.dto';
import { DivergenceSignal } from '../../models/chart/divergence-signal.dto';
import { TokenStorageService } from '../services/tokenStorage.service';

const NAME_IDENTIFIER_CLAIM =
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';
const NAME_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';

/** Token claims that may carry the user id (checked in this order). */
interface UserIdClaims {
  oid?: unknown;
  nameid?: unknown;
  sub?: unknown;
  userId?: unknown;
  uid?: unknown;
  email?: unknown;
  unique_name?: unknown;
  [claim: string]: unknown;
}

/** Live candle fields used to drop placeholder candles (price -1). */
interface LiveCandleLike {
  price?: number;
  Price?: number;
}

/** Chart state record from the API (camelCase or PascalCase); drawings/settings may be JSON strings. */
interface ChartStateRecord {
  id?: string;
  Id?: string;
  userId?: string;
  UserId?: string;
  exchangeId?: number;
  ExchangeId?: number;
  symbol?: string;
  Symbol?: string;
  timeframe?: string;
  Timeframe?: string;
  drawings?: unknown;
  Drawings?: unknown;
  settings?: unknown;
  Settings?: unknown;
}

/**
 * GET /SymbolPredictions: DivPredictionBot state for one symbol. TimeframeResults
 * is stored as jsonb and arrives as a JSON string (or already parsed).
 */
export interface SymbolPredictionsResponse {
  TimeframeResults?: unknown;
  timeframeResults?: unknown;
  [key: string]: unknown;
}

export interface UpdateSymbolPayload {
  Id: number;
  SymbolName: string;
  Active: boolean;
  RunStatus: string;
  Icon?: string;
  ExchangeId?: number;
  IsProduction?: boolean;
}

export interface AiQueueTaskPayload {
  TaskType: string;
  Symbol: string;
}

@Injectable({
  providedIn: 'root',
})
export class ChartService {
  private readonly BASE = environment.apiUrl;
  private readonly http = inject(HttpClient);
  private readonly _settingsService = inject(SettingsService);
  private readonly tokenStorage = inject(TokenStorageService);

  getSymbols(): Observable<SymbolModel[]> {
    return this._settingsService
      .getExchangeId$()
      .pipe(
        switchMap((exchangeId: number) =>
          this.http
            .get<SymbolModel[]>(`${this.BASE}Symbols?exchangeId=${exchangeId}`)
            .pipe(
              map((arr) =>
                (arr || []).filter((s) => s.RunStatus === 'BoxesCollected'),
              ),
            ),
        ),
      );
  }

  getSymbolsForExchange(exchangeId: number): Observable<SymbolModel[]> {
    return this.http
      .get<SymbolModel[]>(`${this.BASE}Symbols?exchangeId=${exchangeId}`)
      .pipe(
        map((arr) =>
          (arr || [])
            .filter((s) => s.RunStatus === 'BoxesCollected')
            .map((s) => ({ ...s, ExchangeId: exchangeId })),
        ),
        catchError(() => of([] as SymbolModel[])),
      );
  }

  updateSymbolById(
    id: number,
    exchangeId: number,
    payload: UpdateSymbolPayload,
  ): Observable<SymbolModel> {
    const params = new HttpParams().set('exchangeId', `${exchangeId}`);
    return this.http.put<SymbolModel>(`${this.BASE}Symbols/${id}`, payload, {
      params,
    });
  }

  enqueueAiTask(
    taskType: string,
    symbol: string,
    exchangeId: number,
  ): Observable<boolean> {
    const params = new HttpParams().set('exchangeId', `${exchangeId}`);
    const payload: AiQueueTaskPayload = {
      TaskType: taskType,
      Symbol: symbol || '',
    };

    return this.http
      .post(`${this.BASE}AiQueue`, payload, {
        params,
        observe: 'response',
      })
      .pipe(
        map((response) => response.ok),
        catchError(() => of(false)),
      );
  }

  /** Returns ALL symbols regardless of RunStatus (used for icon enrichment). */
  getAllSymbols(): Observable<SymbolModel[]> {
    return this._settingsService
      .getExchangeId$()
      .pipe(
        switchMap((exchangeId: number) =>
          this.http
            .get<SymbolModel[]>(`${this.BASE}Symbols?exchangeId=${exchangeId}`)
            .pipe(map((arr) => arr || [])),
        ),
      );
  }

  getExchanges(): Observable<Exchange[]> {
    return this.http.get<Exchange[]>(`${this.BASE}Exchanges`);
  }

  getCandles(
    symbol: string,
    timeframe: string,
    limit = 100,
  ): Observable<Candle[]> {
    // waitForExchangeId$() blocks until the exchange is non-null in the store
    // so we never fire with the null-fallback Id=1 that is present on page
    // refresh before the exchange loading chain completes.
    return this._settingsService.waitForExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe)
          .set('limit', `${limit}`)
          // Add cache-busting parameter to force fresh data on timeframe change
          .set('_t', `${Date.now()}`);
        return this.http.get<Candle[]>(
          `${this.BASE}Candles/bybit?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }

  getFibLevels(symbol: string, timeframe: string): Observable<FibLevel[]> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http.get<FibLevel[]>(
          `${this.BASE}FibLevels?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }

  getEmaMmaLevels(
    symbol: string,
    timeframe: string,
  ): Observable<EmaMmaLevel[]> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http.get<EmaMmaLevel[]>(
          `${this.BASE}EmaMmaLevels?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }

  getVolumeProfiles(
    symbol: string,
    timeframe: string,
  ): Observable<VolumeProfile[]> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http.get<VolumeProfile[]>(
          `${this.BASE}VolumeProfiles?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }

  getBoxes(symbol: string, timeframe: string): Observable<BoxModel[]> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http.get<BoxModel[]>(
          `${this.BASE}Boxes?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }

  getBoxesV2(symbol: string, timeframe: string): Observable<BoxModel[]> {
    // Use the provided symbol directly to avoid extra emissions/subscriptions
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);

        return this.http
          .get<BoxModel[]>(
            `${this.BASE}Boxes/GetReadyBoxes?exchangeId=${exchangeId}`,
            { params },
          )
          .pipe(
            map((boxes) =>
              boxes.map((box) =>
                Object.assign({}, box, {
                  color:
                    box.PositionType === 'LONG'
                      ? 'yellow'
                      : box.PositionType === 'SHORT'
                        ? 'red'
                        : 'grey',
                }),
              ),
            ),
          );
      }),
    );
  }

  getKeyZones(symbol: string): Observable<KeyZonesModel> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId) => {
        const params = new HttpParams().set('symbol', symbol);
        return this.http.get<KeyZonesModel>(
          `${this.BASE}KeyZones?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }

  getOrders(): Observable<OrderModel[]> {
    return this._settingsService
      .getExchangeId$()
      .pipe(
        switchMap((exchangeId: number) =>
          this.http.get<OrderModel[]>(
            `${this.BASE}TradeOrders?exchangeId=${exchangeId}`,
          ),
        ),
      );
  }

  getTradeOrders(symbol: string): Observable<OrderModel[]> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams().set('symbol', symbol);
        return this.http.get<OrderModel[]>(
          `${this.BASE}TradeOrders?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }

  deleteOrder(orderId: number): Observable<void> {
    return this._settingsService
      .getExchangeId$()
      .pipe(
        switchMap((exchangeId: number) =>
          this.http.delete<void>(
            `${this.BASE}TradeOrders/${orderId}?exchangeId=${exchangeId}`,
          ),
        ),
      );
  }

  getWatchlist(): Observable<WatchlistDTO[]> {
    return this._settingsService
      .getExchangeId$()
      .pipe(
        switchMap((exchangeId: number) =>
          this.http.get<WatchlistDTO[]>(
            `${this.BASE}BoxWatchlist/enriched?exchangeId=${exchangeId}`,
          ),
        ),
      );
  }

  getTradeOrdersV2(): Observable<TradePlanModel> {
    return this._settingsService
      .getExchangeId$()
      .pipe(
        switchMap((exchangeId: number) =>
          this.http.get<TradePlanModel>(
            `${this.BASE}TradeOrders/account-balance-pnl?exchangeId=${exchangeId}&accountId=1`,
          ),
        ),
      );
  }

  getCapitalFlowSignals(
    symbol: string,
    timeframe: string,
  ): Observable<CapitalFlowSignal[]> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http.get<CapitalFlowSignal[]>(
          `${this.BASE}CapitalFlowSignals?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }

  getMarketCipherSignals(symbol: string, timeframe: string): Observable<MarketCipherSignal[]> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http.get<MarketCipherSignal[]>(
          `${this.BASE}MarketCipherSignals?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }

  /** DivPredictionBot state for one symbol (per-timeframe results incl. divergence lines); null when none. */
  getSymbolPredictions(symbol: string): Observable<SymbolPredictionsResponse | null> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('exchangeId', `${exchangeId}`)
          .set('symbol', symbol);
        return this.http
          .get<SymbolPredictionsResponse | null>(`${this.BASE}SymbolPredictions`, { params })
          .pipe(catchError(() => of(null)));
      }),
    );
  }

  /** `from` (epoch ms) limits the result to divergences ending at or after it. */
  getDivergences(symbol: string, timeframe: string, from?: number): Observable<DivergenceSignal[]> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        let params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        if (from != null && Number.isFinite(from)) {
          params = params.set('from', new Date(from).toISOString());
        }
        return this.http.get<DivergenceSignal[]>(
          `${this.BASE}Divergences?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }

  getLiveCandleForExchange(
    exchangeId: number,
    symbol: string,
    timeframe: string,
  ): Observable<unknown> {
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('timeframe', timeframe);

    return this.http
      .get<unknown>(`${this.BASE}Candles/live?exchangeId=${exchangeId}`, { params })
      .pipe(
        map((resp: unknown) => {
          if (Array.isArray(resp)) {
            return resp.filter((c: LiveCandleLike | null) => c && c.price !== -1 && c.Price !== -1);
          }
          const candle = resp as LiveCandleLike | null;
          if (candle && (candle.price === -1 || candle.Price === -1)) {
            return null;
          }
          return resp;
        }),
      );
  }

  // ------------------------------------------------------------------
  // Chart State (drawings + settings)
  // ------------------------------------------------------------------

  private getCurrentUserId$(): Observable<string | null> {
    return this.tokenStorage
      .getToken$()
      .pipe(
        map((token) => this.extractUserIdFromToken(token?.AccessToken || '')),
      );
  }

  private extractUserIdFromToken(accessToken: string): string | null {
    if (!accessToken || accessToken.split('.').length !== 3) return null;
    try {
      const decoded = jwtDecode<UserIdClaims>(accessToken);
      const claimValue =
        decoded?.[NAME_IDENTIFIER_CLAIM] ??
        decoded?.oid ??
        decoded?.nameid ??
        decoded?.sub ??
        decoded?.userId ??
        decoded?.uid ??
        decoded?.[NAME_CLAIM] ??
        decoded?.email ??
        decoded?.unique_name;
      if (!claimValue) return null;
      const asText = String(claimValue).trim();
      return asText ? asText : null;
    } catch {
      return null;
    }
  }

  private parseJson<T>(value: unknown, fallback: T): T {
    if (value == null) return fallback;
    if (typeof value !== 'string') return value as T;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  private defaultChartSettings() {
    return {
      showBoxes: true,
      showKeyZones: true,
      showOrders: false,
      showIndicators: true,
      showMarketCipher: false,
      showDivergences: false,
      boxMode: 'boxes' as const,
    };
  }

  private normalizeChartState(
    raw: ChartStateRecord | null,
    fallbackExchangeId: number,
    fallbackSymbol: string,
    fallbackTimeframe = '1h',
  ): ChartStateDto | null {
    if (!raw) return null;

    const drawings = this.parseJson<ChartStateDto['drawings']>(raw.drawings ?? raw.Drawings, []);
    const settingsRaw = this.parseJson<Partial<ChartStateDto['settings']> | null>(
      raw.settings ?? raw.Settings,
      this.defaultChartSettings(),
    );

    return {
      id: raw.id ?? raw.Id,
      userId: raw.userId ?? raw.UserId,
      exchangeId: raw.exchangeId ?? raw.ExchangeId ?? fallbackExchangeId,
      symbol: raw.symbol ?? raw.Symbol ?? fallbackSymbol,
      timeframe: raw.timeframe ?? raw.Timeframe ?? fallbackTimeframe,
      drawings: Array.isArray(drawings) ? drawings : [],
      settings: {
        ...this.defaultChartSettings(),
        ...(settingsRaw || {}),
      },
    };
  }

  /**
   * Load persisted chart state for the given symbol in the selected exchange.
   * Returns null when:
   *  - HTTP 404: no state saved yet for this context
   *  - Any other error (backend absent, 500, network failure): graceful no-op
   */
  loadChartState(
    symbol: string,
    timeframe?: string,
  ): Observable<ChartStateDto | null> {
    return this._settingsService.waitForExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        return this.getCurrentUserId$().pipe(
          switchMap((userId) => {
            if (!userId) {
              console.warn(
                '[ChartState] userId claim not found in token; sending fallback userId for load',
              );
            }

            let params = new HttpParams()
              .set('symbol', symbol)
              .set('exchangeId', `${exchangeId}`);

            params = params.set('userId', userId || 'unknown-user');

            return this.http
              .get<ChartStateRecord | null>(`${this.BASE}api/ChartState`, { params })
              .pipe(
                map((raw) =>
                  this.normalizeChartState(
                    raw,
                    exchangeId,
                    symbol,
                    timeframe || '1h',
                  ),
                ),
                catchError(() => of(null)),
              );
          }),
        );
      }),
    );
  }

  /**
   * Upsert chart state (drawings + settings) for the current user,
   * exchange, symbol and timeframe.  The backend performs an
   * INSERT … ON CONFLICT … DO UPDATE.
   * Silently swallowed when the backend is absent so the chart keeps working.
   */
  saveChartState(state: ChartStateDto): Observable<ChartStateDto | null> {
    return this._settingsService.waitForExchangeId$().pipe(
      switchMap((exchangeId: number) =>
        this.getCurrentUserId$().pipe(
          switchMap((userId) => {
            if (!userId) {
              console.warn(
                '[ChartState] userId claim not found in token; sending fallback userId for save',
              );
            }

            const payload = {
              ExchangeId: exchangeId,
              Symbol: state.symbol,
              Drawings: JSON.stringify(state.drawings ?? []),
              Settings: JSON.stringify(
                state.settings ?? this.defaultChartSettings(),
              ),
              UserId: userId || 'unknown-user',
            };

            return this.http
              .put<ChartStateRecord | null>(`${this.BASE}api/ChartState`, payload)
              .pipe(
                map((raw) =>
                  this.normalizeChartState(
                    raw ?? payload,
                    exchangeId,
                    state.symbol,
                    state.timeframe || '1h',
                  ),
                ),
                catchError(() => of(null)),
              );
          }),
        ),
      ),
    );
  }
}
