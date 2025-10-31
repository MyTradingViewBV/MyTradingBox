import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';
import { environment } from '../../../../../environments/environment.prod';
import { AccountBalanceResponse } from '../../models/accountBallance/accountBalanceResponse.dto';
import { SettingsService } from '../services/settingsService';

@Injectable({ providedIn: 'root' })
export class AccountBalanceService {
  private readonly BASE = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private _settingsService: SettingsService,
  ) {}

  getAccountBalance(accountId: number): Observable<AccountBalanceResponse> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId) =>
        this.http.get<AccountBalanceResponse>(`${this.BASE}AccountBalances`, {
          params: new HttpParams()
            .set('accountId', accountId)
            .set('exchangeId', exchangeId),
        }),
      ),
    );
  }

  getAccountBalanceLog(accountId: number): Observable<AccountBalanceResponse> {
    return this._settingsService.getExchangeId$().pipe(
      switchMap((exchangeId) =>
        this.http.get<AccountBalanceResponse>(`${this.BASE}AccountBalanceLog`, {
          params: new HttpParams()
            .set('accountId', accountId)
            .set('exchangeId', exchangeId),
        }),
      ),
    );
  }
}
