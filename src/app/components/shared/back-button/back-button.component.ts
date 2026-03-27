import { Component, Input, inject } from '@angular/core';
import { Location } from '@angular/common';

@Component({
  selector: 'app-back-button',
  standalone: true,
  template: `
    <button type="button" class="action-btn" (click)="back()" [disabled]="disabled" aria-label="Back">
      <svg viewBox="0 0 24 24" fill="none" stroke="#f6ad55" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 19l-7-7 7-7"/>
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
export class BackButtonComponent {
  @Input() disabled = false;
  private location = inject(Location);

  back(): void {
    this.location.back();
  }
}
