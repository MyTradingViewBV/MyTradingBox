import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { BotHeartbeat } from '../models/bot-heartbeat.model';

export type HeartbeatKind = 'api' | 'service' | 'bot';
export interface HeartbeatItem {
  id: string;
  kind: HeartbeatKind;
  name: string;
  ok: boolean;
  lastAt: Date;
  latencyMs: number;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class HeartbeatService {
  private _items = new BehaviorSubject<HeartbeatItem[]>([]);

  readonly items$ = this._items.asObservable();

  constructor(private http: HttpClient) {}

  load(exchangeId: number): void {
    const url = `https://bot002api-gbh3hwe2egepfph6.swedencentral-01.azurewebsites.net/BotHeartbeat?exchangeId=${exchangeId}`;
    this.http.get<BotHeartbeat[]>(url).subscribe({
      next: (data) => {
        const mapped: HeartbeatItem[] = data.map((d) => ({
          id: String(d.Id),
          kind: 'bot',
          name: d.BotName,
          ok: Boolean(d.HeartbeatReceived && d.MessageReceived),
          lastAt: new Date(d.LastUpdated ?? d.HeartbeatReceivedAt ?? d.MessageReceivedAt ?? d.MessageSentAt ?? new Date().toISOString()),
          latencyMs: 0,
          message: undefined,
        }));
        const sorted = mapped.sort((a, b) => {
          if (a.ok !== b.ok) return a.ok ? 1 : -1; // failed first
          return (b.lastAt?.getTime?.() || 0) - (a.lastAt?.getTime?.() || 0); // recent next
        });
        this._items.next(sorted);
      },
      error: (err) => {
        console.error('[Heartbeat] Fetch failed', err);
        this._items.next([]);
      },
    });
  }
}
