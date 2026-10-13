import {
  Component,
  Input,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { Location } from '@angular/common';

@Component({
  selector: 'app-back-button',
  standalone: true,
  template: `
    <button
      type="button"
      class="action-btn"
      (click)="back()"
      [disabled]="disabled"
      aria-label="Back"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M15 19l-7-7 7-7" />
      </svg>
    </button>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: '../action-button.scss',
})
export class BackButtonComponent {
  @Input() disabled = false;
  private location = inject(Location);

  back(): void {
    this.location.back();
  }
}
