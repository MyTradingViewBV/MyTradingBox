import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';

export interface UserNotificationSettings {
  ExchangeId: number;
  Symbol: string;
  UserId: string;
  NotifyTradeOrderNew: boolean;
  NotifyTradeOrderTarget1: boolean;
  NotifyTradeOrderTarget2: boolean;
  NotifyTradeOrderStopped: boolean;
  NotifyBoxCandleIn: boolean;
  NotifyBoxCandleThrough: boolean;
  NotifyWatchlistActive: boolean;
  NotifyCapitalFlowBronze: boolean;
  NotifyCapitalFlowSilver: boolean;
  NotifyCapitalFlowGold: boolean;
  NotifyCapitalFlowPlatinum: boolean;
  NotifyCapitalFlowInBox: boolean;
  NotifyCapitalFlowOutOfBox: boolean;
  NotifyCfTf12m: boolean;
  NotifyCfTf24m: boolean;
  NotifyCfTf1h: boolean;
  NotifyCfTf4h: boolean;
  NotifyCfTf1d: boolean;
  NotifyCfTf1w: boolean;
  NotifyCfTf1M: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserNotificationSettingsService {
  private readonly BASE = environment.apiUrl;
  private readonly http = inject(HttpClient);

  getAll(exchangeId: number, userId: string): Observable<UserNotificationSettings[]> {
    const params = new HttpParams()
      .set('exchangeId', String(exchangeId))
      .set('userid', userId);
    return this.http.get<UserNotificationSettings[]>(`${this.BASE}api/UserNotificationSettings`, { params });
  }

  update(settings: UserNotificationSettings): Observable<UserNotificationSettings> {
    return this.http.put<UserNotificationSettings>(`${this.BASE}api/UserNotificationSettings`, settings);
  }
}
