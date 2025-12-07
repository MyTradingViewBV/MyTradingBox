import { Injectable } from '@angular/core';
import { BehaviorSubject, interval } from 'rxjs';

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
  private _items = new BehaviorSubject<HeartbeatItem[]>([
    { id: 'api-markets', kind: 'api', name: 'Markets API', ok: true, lastAt: new Date(), latencyMs: 120 },
    { id: 'svc-notify', kind: 'service', name: 'Notification Service', ok: true, lastAt: new Date(), latencyMs: 45 },
    { id: 'bot-scaler', kind: 'bot', name: 'Position Scaler Bot', ok: true, lastAt: new Date(), latencyMs: 88 },
    { id: 'api-orders', kind: 'api', name: 'Orders API', ok: false, lastAt: new Date(), latencyMs: 0, message: 'mock outage' },
  ]);

  readonly items$ = this._items.asObservable();

  constructor() {
    // Mock periodic updates: randomize latency and ok state for demonstration
    interval(3000).subscribe(() => {
      const updated = this._items.getValue().map((it) => {
        const jitter = Math.floor(Math.random() * 50);
        const okFlip = Math.random() > 0.9 ? !it.ok : it.ok;
        return {
          ...it,
          ok: okFlip,
          lastAt: new Date(),
          latencyMs: Math.max(0, it.latencyMs + (Math.random() > 0.5 ? jitter : -jitter)),
          message: okFlip ? undefined : 'mock intermittent issue',
        } as HeartbeatItem;
      });
      this._items.next(updated);
    });
  }

  // Allow seeding extra mock items on demand (e.g., when Admin opens)
  seedExtraMocks(): void {
    const extra: HeartbeatItem[] = [
      { id: 'svc-cache', kind: 'service', name: 'Cache Service', ok: true, lastAt: new Date(), latencyMs: 12 },
      { id: 'api-news', kind: 'api', name: 'News API', ok: true, lastAt: new Date(), latencyMs: 75 },
      { id: 'bot-arbitrage', kind: 'bot', name: 'Arbitrage Bot', ok: Math.random() > 0.3, lastAt: new Date(), latencyMs: 130 },
    ];
    const current = this._items.getValue();
    const merged = [...extra.filter(e => !current.find(c => c.id === e.id)), ...current];
    this._items.next(merged);
  }
}
