import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, switchMap, map } from 'rxjs';
import { environment } from '../../../../environments/environment.prod';
import { AppService } from './appService';
import { AccountBalanceResponse, AccountBalanceLogResponse } from '../models/AccountBalance.dto';

@Injectable({ providedIn: 'root' })
export class AccountBalanceService {
  private readonly BASE = environment.apiUrl;

  constructor(private http: HttpClient, private _appService: AppService) {}

  getAccountBalance(accountId: number): Observable<AccountBalanceResponse> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) =>
        this.http.get<AccountBalanceResponse>(`${this.BASE}AccountBalances`, {
          params: new HttpParams()
            .set('accountId', accountId)
            .set('exchangeId', exchangeId),
        }),
      ),
    );
  }

  getAccountBalanceLog(accountId: number): Observable<AccountBalanceLogResponse> {
    return this.getExchangeId$().pipe(
      switchMap((exchangeId) =>
        this.http.get<AccountBalanceLogResponse>(
          `${this.BASE}AccountBalanceLog`,
          {
            params: new HttpParams()
              .set('accountId', accountId)
              .set('exchangeId', exchangeId),
          },
        ),
      ),
    );
  }

  /** Helper: selected exchange id or fallback 1 */
  private getExchangeId$(): Observable<number> {
    return this._appService
      .getSelectedExchange()
      .pipe(map((ex) => ex?.Id ?? 1));
  }
}
