import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-close-button',
  standalone: true,
  template: `
    <button type="button" class="action-btn" (click)="close.emit()" [disabled]="disabled" aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" stroke="#f6ad55" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 6L6 18"/><path d="M6 6l12 12"/>
      </svg>
    </button>
  `,
  styles: [`
    .action-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #f6ad55;
      width: 36px;
      height: 36px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.25s;
    }
    .action-btn:hover:not([disabled]) {
      background: rgba(221, 107, 32, 0.2);
    }
    .action-btn[disabled] {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .action-btn svg {
      width: 20px;
      height: 20px;
    }
  `],
})
export class CloseButtonComponent {
  @Input() disabled = false;
  @Output() close = new EventEmitter<void>();
}
