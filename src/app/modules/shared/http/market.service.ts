import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, switchMap, map } from 'rxjs';
import { environment } from '../../../../environments/environment.prod';
import { Order } from '../models/order.dto';
import { WatchlistDTO } from '../models/watchlist.dto';
import { Exchange, TradePlanModel } from '../models/TradeOrders.dto';
import { AppService } from './appService';

export interface SymbolModel {
  Id: number;
  SymbolName: string;
  Active: boolean;
  RunStatus: string;
}

export interface Candle {
  Symbol: string;
  Timeframe: string;
  Time: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

export interface FibLevel {
  Symbol: string;
  Timeframe: string;
  Time: string;
  Type: string;
  Level: number;
  Price: number;
}

export interface EmaMmaLevel {
  Id: number;
  Symbol: string;
  Timeframe: string;
  Type: string;
  Period?: number;
  Value: number;
}

export interface VolumeProfile {
  Id: number;
  Symbol: string;
  Timeframe: string;
  Poc: number;
  Vah: number;
  Val: number;
}

export interface BoxModel {
  Id: number;
  Symbol: string;
  Timeframe: string;
  ZoneMin: number;
  ZoneMax: number;
  Reason: string;
  Strength: number;
  Color?: string;
  PositionType?: string;
  Type?: string;
  CreatedAt?: string;
}

@Injectable({
  providedIn: 'root',
})
export class MarketService {
  private readonly BASE = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private _appService: AppService,
  ) {}

  /** ✅ Helper to get selected exchangeId from store or default to 1 */
  getExchangeId$(): Observable<number> {
    return this._appService.getSelectedExchange().pipe(
      map((ex) => (ex?.Id ?? 1))
    );
  }

  getSelectedExchange(): Observable<Exchange | null> {
    return this._appService.getSelectedExchange();
  }

  getSymbols(): Observable<SymbolModel[]> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) =>
        this.http
          .get<SymbolModel[]>(`${this.BASE}Symbols?exchangeId=${exchangeId}`)
          .pipe(map((arr) => (arr || []).filter((s) => s.RunStatus === 'BoxesCollected')))
      )
    );
  }

  getExchanges(): Observable<Exchange[]> {
    return this.http.get<Exchange[]>(`${this.BASE}Exchanges`);
  }

  getCandles(symbol: string, timeframe: string, limit = 100): Observable<Candle[]> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe)
          .set('limit', `${limit}`);
        return this.http.get<Candle[]>(`${this.BASE}Candles/bybit?exchangeId=${exchangeId}`, { params });
      })
    );
  }

  getFibLevels(symbol: string, timeframe: string): Observable<FibLevel[]> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http.get<FibLevel[]>(`${this.BASE}FibLevels?exchangeId=${exchangeId}`, { params });
      })
    );
  }

  getEmaMmaLevels(symbol: string, timeframe: string): Observable<EmaMmaLevel[]> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http.get<EmaMmaLevel[]>(`${this.BASE}EmaMmaLevels?exchangeId=${exchangeId}`, { params });
      })
    );
  }

  getVolumeProfiles(symbol: string, timeframe: string): Observable<VolumeProfile[]> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http.get<VolumeProfile[]>(`${this.BASE}VolumeProfiles?exchangeId=${exchangeId}`, { params });
      })
    );
  }

  getBoxes(symbol: string, timeframe: string): Observable<BoxModel[]> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http.get<BoxModel[]>(`${this.BASE}Boxes?exchangeId=${exchangeId}`, { params });
      })
    );
  }

  getBoxesV2(symbol: string, timeframe: string): Observable<BoxModel[]> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) => {
        const params = new HttpParams()
          .set('symbol', symbol)
          .set('timeframe', timeframe);
        return this.http
          .get<BoxModel[]>(`${this.BASE}Boxes/GetReadyBoxes?exchangeId=${exchangeId}`, { params })
          .pipe(
            map((boxes) =>
              boxes.map((box) => ({
                ...box,
                color:
                  box.PositionType === 'LONG'
                    ? 'green'
                    : box.PositionType === 'SHORT'
                    ? 'red'
                    : 'grey',
              })),
            ),
          );
      })
    );
  }

  getOrders(): Observable<Order[]> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) =>
        this.http.get<Order[]>(`${this.BASE}TradeOrders?exchangeId=${exchangeId}`)
      )
    );
  }

  deleteOrder(orderId: number): Observable<void> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) =>
        this.http.delete<void>(`${this.BASE}TradeOrders/${orderId}?exchangeId=${exchangeId}`)
      )
    );
  }

  getWatchlist(): Observable<WatchlistDTO[]> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) =>
        this.http.get<WatchlistDTO[]>(`${this.BASE}BoxWatchlist/enriched?exchangeId=${exchangeId}`)
      )
    );
  }

  getTradeOrders(): Observable<TradePlanModel> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) =>
        this.http.get<TradePlanModel>(
          `${this.BASE}TradeOrders/pnl?exchangeId=${exchangeId}&stake=${10000}`
        )
      )
    );
  }
}
