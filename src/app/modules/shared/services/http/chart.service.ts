import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, switchMap, map, catchError, of } from 'rxjs';
import { environment } from '../../../../../environments/environment';
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

  constructor() {}

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

  updateSymbolById(
    id: number,
    exchangeId: number,
    payload: UpdateSymbolPayload,
  ): Observable<SymbolModel> {
    const params = new HttpParams().set('exchangeId', `${exchangeId}`);
    return this.http.put<SymbolModel>(
      `${this.BASE}Symbols/${id}`,
      payload,
      { params },
    );
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
          .get<
            BoxModel[]
          >(`${this.BASE}Boxes/GetReadyBoxes?exchangeId=${exchangeId}`, { params })
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

  getCapitalFlowSignals(symbol: string, timeframe: string): Observable<CapitalFlowSignal[]> {
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

  getMarketCipherSignals(symbol: string, timeframe: string): Observable<any[]> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http.get<any[]>(
          `${this.BASE}MarketCipherSignals?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }

  getDivergences(symbol: string, timeframe: string): Observable<any[]> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http.get<any[]>(
          `${this.BASE}Divergences?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }

  getLiveCandle(symbol: string, timeframe: string): Observable<any> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http
          .get<any>(`${this.BASE}Candles/live?exchangeId=${exchangeId}`, {
            params,
          })
          .pipe(
            map((resp: any) => {
              if (Array.isArray(resp)) {
                return resp.filter(
                  (c) => c && c.price !== -1 && c.Price !== -1,
                );
              }
              if (resp && (resp.price === -1 || resp.Price === -1)) {
                return null; // drop invalid single record
              }
              return resp;
            }),
          );
      }),
    );
  }

  // ------------------------------------------------------------------
  // Chart State (drawings + settings)
  // ------------------------------------------------------------------

  /**
   * Load persisted chart state for the given symbol + timeframe.
   * Returns null when:
   *  - HTTP 404: no state saved yet for this context
   *  - Any other error (backend absent, 500, network failure): graceful no-op
   */
  loadChartState(
    symbol: string,
    timeframe: string,
  ): Observable<ChartStateDto | null> {
    return this._settingsService.waitForExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe)
          .set('exchangeId', `${exchangeId}`);
        return this.http.get<ChartStateDto | null>(
          `${this.BASE}ChartState`,
          { params },
        ).pipe(
          catchError(() => of(null)),
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
        this.http.put<ChartStateDto>(
          `${this.BASE}ChartState`,
          { ...state, exchangeId },
        ).pipe(
          catchError(() => of(null)),
        ),
      ),
    );
  }
}
