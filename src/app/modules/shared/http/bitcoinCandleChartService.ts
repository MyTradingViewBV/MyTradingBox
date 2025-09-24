import { Injectable } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import {
  BoxModel,
  Candle,
  EmaMmaLevel,
  FibLevel,
  MarketService,
  SymbolModel,
  VolumeProfile,
} from './market.service';

@Injectable({ providedIn: 'root' })
export class BitcoinCandleChartService {
  private candlesCache = new Map<string, Candle[]>();
  private fibCache = new Map<string, FibLevel[]>();
  private emaCache = new Map<string, EmaMmaLevel[]>();
  private volumeProfileCache = new Map<string, VolumeProfile[]>();
  private boxesCache = new Map<string, BoxModel[]>();
  private symbolsCache?: SymbolModel[];

  constructor(private market: MarketService) {}

  getCandles(symbol: string, tf: string, limit = 250): Observable<Candle[]> {
    const key = `${symbol}|${tf}|${limit}`;
    const cached = this.candlesCache.get(key);
    if (cached) return of(cached);

    return this.market
      .getCandles(symbol, tf, limit)
      .pipe(tap((candles) => this.candlesCache.set(key, candles)));
  }

  getFibLevels(symbol: string, tf: string): Observable<FibLevel[]> {
    const key = `${symbol}|${tf}`;
    const cached = this.fibCache.get(key);
    if (cached) return of(cached);

    return this.market
      .getFibLevels(symbol, tf)
      .pipe(tap((levels) => this.fibCache.set(key, levels)));
  }

  getEmaMmaLevels(symbol: string, tf: string): Observable<EmaMmaLevel[]> {
    const key = `${symbol}|${tf}`;
    const cached = this.emaCache.get(key);
    if (cached) return of(cached);

    return this.market
      .getEmaMmaLevels(symbol, tf)
      .pipe(tap((levels) => this.emaCache.set(key, levels)));
  }

  getVolumeProfiles(symbol: string, tf: string): Observable<VolumeProfile[]> {
    const key = `${symbol}|${tf}`;
    const cached = this.volumeProfileCache.get(key);
    if (cached) return of(cached);

    return this.market
      .getVolumeProfiles(symbol, tf)
      .pipe(tap((levels) => this.volumeProfileCache.set(key, levels)));
  }

  getBoxes(symbol: string): Observable<BoxModel[]> {
    console.log('BitcoinCandleChartService: getBoxes called');
    const key = `${symbol}|1d`;
    // const cached = this.boxesCache.get(key);
    // if (cached) return of(cached);
    console.log('Cache miss for boxes, fetching from market service');
    return this.market
      .getBoxes(symbol, '1d')
      .pipe(tap((boxes) => this.boxesCache.set(key, boxes)));
  }

  getBoxesV2(symbol: string): Observable<BoxModel[]> {
    console.log('BitcoinCandleChartService: getBoxesV2 called');
    const key = `${symbol}|1d`;
    // const cached = this.boxesCache.get(key);
    // if (cached) return of(cached);
    console.log('Cache miss for boxesV2, fetching from market service');
    return this.market
      .getBoxesV2(symbol, '1d')
      .pipe(tap((boxes) => this.boxesCache.set(key, boxes)));
  }

  getSymbols(): Observable<SymbolModel[]> {
    if (this.symbolsCache) return of(this.symbolsCache);
    return this.market
      .getSymbols()
      .pipe(tap((symbols) => (this.symbolsCache = symbols)));
  }
}
