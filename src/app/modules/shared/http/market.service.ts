import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment.prod';
import { Order } from '../models/order.dto';
import { WatchlistDTO } from '../models/watchlist.dto';
import { TradePlanModel } from '../models/TradeOrders.dto';

export interface SymbolModel {
  Id: number;
  SymbolName: string;
  Active: boolean;
  RunStatus: string;
}

export interface Candle {
  Symbol: string;
  Timeframe: string;
  Time: string; // ISO date string
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
  Type: string; // 'MMA' or 'EMA' or 'VWAP' etc
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
  // private readonly BASE = 'https://localhost:7212/';
  private readonly BASE = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getSymbols(): Observable<SymbolModel[]> {
    return this.http
      .get<SymbolModel[]>(`${this.BASE}Symbols?exchangeId=1`)
      .pipe(
        map((arr) =>
          (arr || []).filter((s) => s.RunStatus === 'BoxesCollected'),
        ),
      );
  }

  getCandles(
    symbol: string,
    timeframe: string,
    limit = 100,
  ): Observable<Candle[]> {
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('timeframe', timeframe)
      .set('limit', `${limit}`);
    return this.http.get<Candle[]>(`${this.BASE}Candles/bybit?exchangeId=1`, { params });
  }

  getFibLevels(symbol: string, timeframe: string): Observable<FibLevel[]> {
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('timeframe', timeframe);
    return this.http.get<FibLevel[]>(`${this.BASE}FibLevels?exchangeId=1`, { params });
  }

  getEmaMmaLevels(
    symbol: string,
    timeframe: string,
  ): Observable<EmaMmaLevel[]> {
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('timeframe', timeframe);
    return this.http.get<EmaMmaLevel[]>(`${this.BASE}EmaMmaLevels?exchangeId=1`, { params });
  }

  getVolumeProfiles(
    symbol: string,
    timeframe: string,
  ): Observable<VolumeProfile[]> {
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('timeframe', timeframe);
    return this.http.get<VolumeProfile[]>(`${this.BASE}VolumeProfiles?exchangeId=1`, {
      params,
    });
  }

  getBoxes(symbol: string, timeframe: string): Observable<BoxModel[]> {
    console.log('MarketService: getBoxes called');
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('timeframe', timeframe);
    return this.http.get<BoxModel[]>(`${this.BASE}Boxes?exchangeId=1`, { params });
  }

  getBoxesV2(symbol: string, timeframe: string): Observable<BoxModel[]> {
    console.log('MarketService: getBoxesV2 called');
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('timeframe', timeframe);

    return this.http
      .get<BoxModel[]>(`${this.BASE}Boxes/GetReadyBoxes?exchangeId=1`, { params })
      .pipe(
        map((boxes: BoxModel[]) =>
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
  }

  getOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.BASE}TradeOrders?exchangeId=1`);
  }

  deleteOrder(orderId: number): Observable<void> {
    return this.http.delete<void>(`${this.BASE}TradeOrders/${orderId}?exchangeId=1`);
  }

  getWatchlist(): Observable<WatchlistDTO[]> {
    return this.http.get<WatchlistDTO[]>(`${this.BASE}BoxWatchlist/enriched?exchangeId=1`);
  }

  getTradeOrders(): Observable<TradePlanModel> {
    return this.http.get<TradePlanModel>(
      `${this.BASE}TradeOrders/pnl?exchangeId=1&stake=${10000}`,
    );
  }
}
