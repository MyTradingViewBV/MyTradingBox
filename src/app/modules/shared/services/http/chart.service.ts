import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, switchMap, map } from 'rxjs';
import { environment } from '../../../../../environments/environment.prod';
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

@Injectable({
  providedIn: 'root',
})
export class ChartService {
  private readonly BASE = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private _settingsService: SettingsService,
  ) {}

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

  getExchanges(): Observable<Exchange[]> {
    return this.http.get<Exchange[]>(`${this.BASE}Exchanges`);
  }

  getCandles(
    symbol: string,
    timeframe: string,
    limit = 100,
  ): Observable<Candle[]> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe)
          .set('limit', `${limit}`);
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
    return this._settingsService.getSelectedSymbol().pipe(
      switchMap((selectedSymbol: SymbolModel | null) =>
        this._settingsService.getExchangeId$().pipe(
          switchMap((exchangeId: number) => {
            const params = new HttpParams()
              .set('symbol', selectedSymbol?.SymbolName || symbol)
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
                          ? 'green'
                          : box.PositionType === 'SHORT'
                            ? 'red'
                            : 'grey',
                    }),
                  ),
                ),
              );
          }),
        ),
      ),
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getIndicatorSignals(symbol: string, timeframe: string): Observable<any[]> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId: number) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.http.get<any[]>(
          `${this.BASE}Indicator?exchangeId=${exchangeId}`,
          { params },
        );
      }),
    );
  }
}
