import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
} from '@angular/core';

@Component({
  selector: 'app-refresh-button',
  standalone: true,
  template: `
    <button
      type="button"
      class="action-btn"
      (click)="refresh.emit()"
      [disabled]="disabled"
      aria-label="Refresh"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M23 4v6h-6" />
        <path d="M1 20v-6h6" />
        <path
          d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"
        />
      </svg>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: '../action-button.scss',
})
export class RefreshButtonComponent {
  @Input() disabled = false;
  @Output() refresh = new EventEmitter<void>();
}
