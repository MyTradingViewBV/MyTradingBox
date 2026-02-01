import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class NotificationLogService {
  private _entries: string[] = [];
  private _subject = new BehaviorSubject<string[]>(this._entries.slice());
  entries$ = this._subject.asObservable();

  add(msg: string): void {
    const timestamp = new Date().toISOString();
    this._entries.unshift(`[${timestamp}] ${msg}`);
    // Limit size
    if (this._entries.length > 100) this._entries.pop();
    this._subject.next(this._entries.slice());
  }

  clear(): void {
    this._entries = [];
    this._subject.next([]);
  }
}
