import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
  NotifyCfTF12m: boolean;
  NotifyCfTF24m: boolean;
  NotifyCfTF1h: boolean;
  NotifyCfTF4h: boolean;
  NotifyCfTF1d: boolean;
  NotifyCfTF1w: boolean;
  NotifyCfTF1M: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserNotificationSettingsService {
  private readonly BASE = environment.apiUrl;
  private readonly http = inject(HttpClient);

  getAll(): Observable<UserNotificationSettings[]> {
    return this.http.get<UserNotificationSettings[]>(`${this.BASE}api/UserNotificationSettings`);
  }

  update(settings: UserNotificationSettings): Observable<UserNotificationSettings> {
    return this.http.put<UserNotificationSettings>(`${this.BASE}api/UserNotificationSettings`, settings);
  }
}
