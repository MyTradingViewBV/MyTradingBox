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
      .get<SymbolModel[]>(`${this.BASE}Symbols`)
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
    return this.http.get<Candle[]>(`${this.BASE}Candles/bybit`, { params });
  }

  getFibLevels(symbol: string, timeframe: string): Observable<FibLevel[]> {
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('timeframe', timeframe);
    return this.http.get<FibLevel[]>(`${this.BASE}FibLevels`, { params });
  }

  getEmaMmaLevels(
    symbol: string,
    timeframe: string,
  ): Observable<EmaMmaLevel[]> {
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('timeframe', timeframe);
    return this.http.get<EmaMmaLevel[]>(`${this.BASE}EmaMmaLevels`, { params });
  }

  getVolumeProfiles(
    symbol: string,
    timeframe: string,
  ): Observable<VolumeProfile[]> {
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('timeframe', timeframe);
    return this.http.get<VolumeProfile[]>(`${this.BASE}VolumeProfiles`, {
      params,
    });
  }

  getBoxes(symbol: string, timeframe: string): Observable<BoxModel[]> {
    console.log('MarketService: getBoxes called');
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('timeframe', timeframe);
    return this.http.get<BoxModel[]>(`${this.BASE}Boxes`, { params });
  }

  getBoxesV2(symbol: string, timeframe: string): Observable<BoxModel[]> {
    console.log('MarketService: getBoxesV2 called');
    const params = new HttpParams()
      .set('symbol', symbol)
      .set('timeframe', timeframe);
    return this.http.get<BoxModel[]>(`${this.BASE}Boxes/GetReadyBoxes`, { params });
  }

  getOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.BASE}TradeOrders`);
  }

  deleteOrder(orderId: number): Observable<void> {
    return this.http.delete<void>(`${this.BASE}TradeOrders/${orderId}`);
  }

  getWatchlist(): Observable<WatchlistDTO[]> {
    return this.http.get<WatchlistDTO[]>(`${this.BASE}BoxWatchlist/enriched`);
  }

  getTradeOrders(): Observable<TradePlanModel> {
    return this.http.get<TradePlanModel>(
      `${this.BASE}TradeOrders/pnl?stake=${10000}`,
    );
  }
}
