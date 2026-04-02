import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { Observable, switchMap, map, forkJoin, of } from 'rxjs';
import { SettingsService } from '../services/settingsService';
import { AppService } from '../services/appService';
import { UserSymbol } from '../../models/userSymbols/user-symbol.dto';

export interface UserSymbolProfileBox {
  BoxId: number;
  Timeframe: string;
  Direction: string;
  ZoneMin?: number;
  ZoneMax?: number;
  zoneMin?: number;
  zoneMax?: number;
  MinZone?: number;
  MaxZone?: number;
  Type?: string;
  type?: string;
  Color?: string;
  color?: string;
  PositionType?: string;
  positionType?: string;
}

export interface UserSymbolProfileCapitalFlow {
  Timeframe: string;
  Tier: string | null;
  SignalType: string | null;
  IsBullish: boolean;
  IsBearish: boolean;
  BarsAgo: number | null;
}

export interface UserSymbolProfile {
  Id?: number;
  UserSymbolId?: number;
  SymbolId?: number;
  ExchangeId?: number;
  Symbol: string;
  Name: string;
  Icon: string | null;
  Boxes: UserSymbolProfileBox[];
  CapitalFlow: UserSymbolProfileCapitalFlow[];
}

@Injectable({ providedIn: 'root' })
export class UserSymbolsService {
  private readonly BASE = environment.apiUrl;
  private readonly http = inject(HttpClient);
  private readonly _settingsService = inject(SettingsService);
  private readonly _appService = inject(AppService);

  constructor() {}

  /**
   * Load user symbols for the currently selected exchange.
   */
  getUserSymbols(): Observable<UserSymbol[]> {
    return this._settingsService.getSelectedExchange().pipe(
      switchMap((exchange) => {
        const exchangeId = exchange?.Id ?? 1;
        return this.http.get<UserSymbol[]>(`${this.BASE}api/UserSymbols?exchangeId=${exchangeId}`).pipe(
          map((arr) => arr || [])
        );
      })
    );
  }

  /**
   * Load watchlist profile for the current user and selected exchange.
   * Uses forkJoin to wait for both the exchange ID and user ID before firing
   * the HTTP request, preventing premature calls with wrong/missing values.
   */
  getUserSymbolsProfile(userId: string = '6ce946c1-5099-4fbd-96e3-d1cac747adc7'): Observable<UserSymbolProfile[]> {
    return this._settingsService.getSelectedExchange().pipe(
      switchMap((exchange) => {
        const exchangeId = exchange?.Id ?? 1;
        return this.http.get<UserSymbolProfile[]>(
          `${this.BASE}api/UserSymbols/${userId}/profile?exchangeId=${exchangeId}`,
        );
      }),
      map((arr) => arr || []),
    );
  }

  /**
   * Add a symbol to the user profile for the selected exchange.
   * API expects body: { SymbolId: number, ExchangeId: number }
   */
  addUserSymbol(symbolId: number): Observable<UserSymbol> {
    return this._settingsService.getSelectedExchange().pipe(
      switchMap((exchange) => {
        const exchangeId = exchange?.Id ?? 1;
        const body = { SymbolId: symbolId, ExchangeId: exchangeId };
        return this.http.post<UserSymbol>(`${this.BASE}api/UserSymbols`, body);
      })
    );
  }

  /**
   * Delete a user symbol by its UserSymbol Id
   */
  deleteUserSymbol(userSymbolId: number): Observable<void> {
    return this._settingsService.getSelectedExchange().pipe(
      switchMap((exchange) => {
        const exchangeId = exchange?.Id ?? 1;
        return this.http.delete<void>(`${this.BASE}api/UserSymbols/${userSymbolId}?exchangeId=${exchangeId}`);
      })
    );
  }
}
