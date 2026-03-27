import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, ToastMessage } from '../../../helpers/toast.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (current) {
      <div class="toast-container" [class]="'toast-' + current.type" role="alert" aria-live="assertive">
        <svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          @if (current.type === 'error') {
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          } @else if (current.type === 'warning') {
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          } @else if (current.type === 'success') {
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          } @else {
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          }
        </svg>
        <span class="toast-text">{{ current.text }}</span>
        <button class="toast-close" (click)="dismiss()" aria-label="Sluiten">×</button>
      </div>
    }
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 10px;
      min-width: 260px;
      max-width: calc(100vw - 32px);
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      font-size: 14px;
      font-weight: 500;
      animation: toastIn 0.2s ease;
      color: #fff;
    }

    @keyframes toastIn {
      from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }

    .toast-error   { background: #c0392b; border: 1px solid #e74c3c; }
    .toast-warning { background: #b8680d; border: 1px solid #e67e22; }
    .toast-success { background: #1a7a5e; border: 1px solid #2ecc71; }
    .toast-info    { background: #1a4a8a; border: 1px solid #3498db; }

    .toast-icon { flex-shrink: 0; }

    .toast-text { flex: 1; line-height: 1.4; }

    .toast-close {
      background: none;
      border: none;
      color: rgba(255,255,255,0.8);
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 0 2px;
      flex-shrink: 0;
    }
    .toast-close:hover { color: #fff; }
  `],
})
export class ToastComponent implements OnInit, OnDestroy {
  private readonly _toast = inject(ToastService);
  private readonly _cdr = inject(ChangeDetectorRef);

  current: ToastMessage | null = null;
  private _sub?: Subscription;
  private _timer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this._sub = this._toast.toast$.subscribe((msg) => {
      clearTimeout(this._timer);
      this.current = msg;
      this._cdr.markForCheck();
      this._timer = setTimeout(() => {
        this.current = null;
        this._cdr.markForCheck();
      }, msg.duration ?? 4000);
    });
  }

  dismiss(): void {
    clearTimeout(this._timer);
    this.current = null;
    this._cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this._sub?.unsubscribe();
    clearTimeout(this._timer);
  }
}
