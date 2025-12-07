import { Injectable } from '@angular/core';
import { BehaviorSubject, interval } from 'rxjs';

export interface LogEntry {
  at: Date;
  level: 'INFO' | 'WARN' | 'ERROR';
  source: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class LogsService {
  private _entries = new BehaviorSubject<LogEntry[]>([
    { at: new Date(), level: 'INFO', source: 'bootstrap', message: 'Admin module initialized' },
    { at: new Date(), level: 'WARN', source: 'orders-api', message: 'Latency high (mock)' },
    { at: new Date(), level: 'ERROR', source: 'bot-scaler', message: 'Restart required (mock)' },
  ]);

  readonly entries$ = this._entries.asObservable();

  constructor() {
    // Periodically append a random log entry for demo
    interval(5000).subscribe(() => {
      const levels: LogEntry['level'][] = ['INFO', 'WARN', 'ERROR'];
      const sources = ['markets-api', 'orders-api', 'notify-service', 'bot-scaler'];
      const msgs = ['heartbeat OK', 'retrying...', 'connection unstable', 'recovering', 'mock event'];
      const entry: LogEntry = {
        at: new Date(),
        level: levels[Math.floor(Math.random() * levels.length)],
        source: sources[Math.floor(Math.random() * sources.length)],
        message: msgs[Math.floor(Math.random() * msgs.length)],
      };
      const next = [entry, ...this._entries.getValue()].slice(0, 50);
      this._entries.next(next);
    });
  }

  // Seed a burst of mock logs when Admin is opened
  seedBurst(): void {
    const now = new Date();
    const burst: LogEntry[] = [
      { at: now, level: 'INFO', source: 'markets-api', message: 'Warm cache (mock)' },
      { at: now, level: 'WARN', source: 'notify-service', message: 'Retry queue growing (mock)' },
      { at: now, level: 'ERROR', source: 'orders-api', message: 'Timeout connecting (mock)' },
    ];
    const next = [...burst, ...this._entries.getValue()].slice(0, 100);
    this._entries.next(next);
  }
}
