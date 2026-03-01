import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { Observable, switchMap, map } from 'rxjs';
import { SettingsService } from '../services/settingsService';
import { UserSymbol } from '../../models/userSymbols/user-symbol.dto';

@Injectable({ providedIn: 'root' })
export class UserSymbolsService {
  private readonly BASE = environment.apiUrl;
  private readonly http = inject(HttpClient);
  private readonly _settingsService = inject(SettingsService);

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
