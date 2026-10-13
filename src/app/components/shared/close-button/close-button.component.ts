import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
} from '@angular/core';

@Component({
  selector: 'app-close-button',
  standalone: true,
  template: `
    <button
      type="button"
      class="action-btn"
      (click)="close.emit()"
      [disabled]="disabled"
      aria-label="Close"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 6L6 18" />
        <path d="M6 6l12 12" />
      </svg>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: '../action-button.scss',
})
export class CloseButtonComponent {
  @Input() disabled = false;
  @Output() close = new EventEmitter<void>();
}
