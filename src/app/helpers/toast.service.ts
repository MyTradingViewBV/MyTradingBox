import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type ToastType = 'error' | 'warning' | 'success' | 'info';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastMessage {
  text: string;
  type: ToastType;
  duration?: number; // ms, default 4000; 0 = stays until closed or the action runs
  action?: ToastAction;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toast$ = new Subject<ToastMessage>();
  readonly toast$ = this._toast$.asObservable();

  show(text: string, type: ToastType = 'info', duration = 4000, action?: ToastAction): void {
    this._toast$.next({ text, type, duration, action });
  }

  error(text: string, duration = 5000): void {
    this.show(text, 'error', duration);
  }

  warning(text: string, duration = 4000): void {
    this.show(text, 'warning', duration);
  }

  success(text: string, duration = 3000): void {
    this.show(text, 'success', duration);
  }
}
