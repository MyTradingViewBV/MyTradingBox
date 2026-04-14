import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { Observable, switchMap, map, forkJoin, of, catchError, take } from 'rxjs';
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
  ExchangeName?: string;
  Symbol: string;
  Name: string;
  SymbolName?: string;
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
      take(1),
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
  getUserSymbolsProfile(userId?: string): Observable<UserSymbolProfile[]> {
    return forkJoin({
      exchange: this._settingsService.getSelectedExchange().pipe(take(1)),
      actualUserId: userId ? of(userId) : this._appService.getUserId$(),
    }).pipe(
      switchMap(({ exchange, actualUserId }) => {
        const exchangeId = exchange?.Id ?? 1;
        const id = actualUserId || '6ce946c1-5099-4fbd-96e3-d1cac747adc7';
        return this.http.get<UserSymbolProfile[]>(
          `${this.BASE}api/UserSymbols/${id}/profile?exchangeId=${exchangeId}`,
        );
      }),
      map((arr) => arr || []),
    );
  }

  /**
   * Load watchlist profile for a specific exchange (used when aggregating all exchanges).
   * If no userId is provided, uses the current user's ID from AppService.
   */
  getUserSymbolsProfileForExchange(
    exchangeId: number,
    userId?: string,
  ): Observable<UserSymbolProfile[]> {
    if (userId) {
      // If userId is explicitly provided, use it directly
      return this.http
        .get<UserSymbolProfile[]>(`${this.BASE}api/UserSymbols/${userId}/profile?exchangeId=${exchangeId}`)
        .pipe(map((arr) => arr || []));
    }
    // Otherwise, get the current user's ID from AppService
    return this._appService.getUserId$().pipe(
      switchMap((currentUserId) => {
        const id = currentUserId || '6ce946c1-5099-4fbd-96e3-d1cac747adc7';
        return this.http.get<UserSymbolProfile[]>(
          `${this.BASE}api/UserSymbols/${id}/profile?exchangeId=${exchangeId}`,
        );
      }),
      map((arr) => arr || []),
    );
  }

  /**
   * Load user symbols for a specific exchange (used when aggregating all exchanges).
   */
  getUserSymbolsForExchange(exchangeId: number): Observable<UserSymbol[]> {
    return this.http
      .get<UserSymbol[]>(`${this.BASE}api/UserSymbols?exchangeId=${exchangeId}`)
      .pipe(
        map((arr) => arr || []),
        catchError(() => of([] as UserSymbol[])),
      );
  }

  /**
   * Add a symbol to the user profile with an explicit exchange ID.
   */
  addUserSymbolWithExchange(symbolId: number, exchangeId: number): Observable<UserSymbol> {
    const body = { SymbolId: symbolId, ExchangeId: exchangeId };
    return this.http.post<UserSymbol>(`${this.BASE}api/UserSymbols`, body);
  }

  /**
   * Add a symbol to the user profile for the selected exchange.
   * API expects body: { SymbolId: number, ExchangeId: number }
   */
  addUserSymbol(symbolId: number): Observable<UserSymbol> {
    return this._settingsService.getSelectedExchange().pipe(
      take(1),
      switchMap((exchange) => {
        const exchangeId = exchange?.Id ?? 1;
        const body = { SymbolId: symbolId, ExchangeId: exchangeId };
        return this.http.post<UserSymbol>(`${this.BASE}api/UserSymbols`, body);
      })
    );
  }

  /**
   * Delete a user symbol by its UserSymbol Id.
   * When exchangeId is provided, it is used directly (needed for multi-exchange watchlists).
   * Otherwise, the currently selected exchange is used.
   */
  deleteUserSymbol(userSymbolId: number, exchangeId?: number): Observable<void> {
    return this._settingsService.getSelectedExchange().pipe(
      take(1),
      switchMap((exchange) => {
        const resolvedExchangeId = exchangeId ?? exchange?.Id ?? 1;
        return this.http.delete<void>(`${this.BASE}api/UserSymbols/exchange/${resolvedExchangeId}`, {
          params: { id: userSymbolId.toString() }
        });
      })
    );
  }
}
