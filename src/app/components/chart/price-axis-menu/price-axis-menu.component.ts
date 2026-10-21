import { ChangeDetectionStrategy, Component, HostListener, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ToastService } from '../../../helpers/toast.service';
import type { PriceAxisMenuItem } from '../utils/axis-price-tags';

/**
 * Copy-price menu of the price axis (TradingView "Copy price"): opened by a long-press on the axis on touch
 * or a right-click with a mouse; one entry per price label under the press plus the price at the press.
 * A press anywhere outside it closes it without reaching the chart.
 */
@Component({
  selector: 'app-price-axis-menu',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pam-backdrop" (mousedown)="dismiss($event)" (touchstart)="dismiss($event)"
      (contextmenu)="dismiss($event)" (wheel)="closed.emit()"></div>
    <div class="pam" role="menu" [style.top.px]="top()" [style.right.px]="right()"
      (mousedown)="$event.stopPropagation()" (touchstart)="$event.stopPropagation()"
      (touchend)="$event.stopPropagation()" (contextmenu)="dismiss($event)">
      @for (item of items(); track $index) {
        <button type="button" role="menuitem" class="pam__item" (click)="copy(item)">
          <span class="pam__dot" [style.background]="item.color"></span>
          <span class="pam__text">{{ 'CHART.COPY_PRICE' | translate }} <b>{{ item.display }}</b></span>
          @if (item.labelKey || item.label) {
            <span class="pam__source">{{ item.labelKey ? (item.labelKey | translate) : item.label }}</span>
          }
        </button>
      }
    </div>
  `,
  styles: `
    .pam-backdrop {
      position: absolute;
      inset: 0;
      z-index: 5;
    }
    .pam {
      position: absolute;
      z-index: 6;
      transform: translateY(-50%);
      min-width: 190px;
      max-width: calc(100% - 16px);
      padding: 4px 0;
      background: #1e222d;
      border: 1px solid #363a45;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif;
    }
    .pam__item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 36px;
      padding: 6px 12px;
      border: 0;
      background: transparent;
      color: #d1d4dc;
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      touch-action: manipulation;
      &:hover,
      &:focus-visible {
        background: #2a2e39;
        outline: none;
      }
    }
    .pam__dot {
      flex: none;
      width: 8px;
      height: 8px;
      border-radius: 2px;
    }
    .pam__text {
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      b {
        font-weight: 600;
        color: #fff;
      }
    }
    .pam__source {
      margin-left: auto;
      padding-left: 8px;
      color: #787b86;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
})
export class PriceAxisMenuComponent {
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly items = input.required<PriceAxisMenuItem[]>();
  /** Centre of the menu, px from the top of the chart container. */
  readonly top = input.required<number>();
  /** Right edge of the menu, px from the right of the chart container. */
  readonly right = input.required<number>();
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closed.emit();
  }

  dismiss(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.closed.emit();
  }

  async copy(item: PriceAxisMenuItem): Promise<void> {
    // Started inside the click: iOS only allows clipboard writes from a user gesture.
    const copying = copyText(item.text);
    this.closed.emit();
    if (await copying) {
      this.toast.success(this.translate.instant('CHART.PRICE_COPIED', { price: item.text }), 2000);
    } else {
      this.toast.error(this.translate.instant('CHART.PRICE_COPY_FAILED'));
    }
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to the selection copy below (older WebViews, no clipboard permission).
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
