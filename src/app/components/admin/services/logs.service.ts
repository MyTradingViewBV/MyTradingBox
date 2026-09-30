import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface LogEntry {
  at: Date;
  level: 'INFO' | 'WARN' | 'ERROR';
  source: string;
  message: string;
}

/**
 * Holds system log entries for the admin panel.
 *
 * The API currently exposes no system-logs endpoint, so this service starts
 * empty and never fabricates entries. Wire a real `load()` here once the
 * backend offers one.
 */
@Injectable({ providedIn: 'root' })
export class LogsService {
  private readonly _entries = new BehaviorSubject<LogEntry[]>([]);

  readonly entries$ = this._entries.asObservable();
}
