import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Candle } from 'src/app/modules/shared/models/chart/candle.dto';

const WIDTH = 240;
const HEIGHT = 96;
const PAD = 4;

interface CandleShape {
  x: number;
  bodyX: number;
  active: boolean;
  bodyY: number;
  bodyH: number;
  wickTop: number;
  wickBottom: number;
  up: boolean;
}

/**
 * Small candlestick chart in the app's up/down colours, with a hover readout
 * of the candle's OHLC. Drawn as plain SVG so it stays light on mobile.
 */
@Component({
  selector: 'app-mini-candles',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (candlesVm(); as vm) {
      <svg
        class="candles"
        [attr.viewBox]="vm.viewBox"
        preserveAspectRatio="none"
        role="img"
        [attr.aria-label]="vm.label"
        (pointermove)="onMove($event)"
        (pointerleave)="hover.set(null)"
      >
        @for (c of vm.items; track $index) {
          <line
            [class.up]="c.up"
            [class.down]="!c.up"
            class="wick"
            [attr.x1]="c.x"
            [attr.x2]="c.x"
            [attr.y1]="c.wickTop"
            [attr.y2]="c.wickBottom"
            vector-effect="non-scaling-stroke"
          />
          <rect
            [class.up]="c.up"
            [class.down]="!c.up"
            class="body"
            [attr.x]="c.bodyX"
            [attr.y]="c.bodyY"
            [attr.width]="vm.bodyW"
            [attr.height]="c.bodyH"
            [class.active]="c.active"
          />
        }
      </svg>
      @if (vm.readout) {
        <div class="readout">{{ vm.readout }}</div>
      }
    } @else {
      <div class="empty">—</div>
    }
  `,
  styles: `
    :host { display: block; position: relative; }
    .candles { display: block; width: 100%; height: 96px; touch-action: pan-y; }
    .wick { stroke-width: 1; }
    .wick.up { stroke: #089981; }
    .wick.down { stroke: #f23645; }
    .body.up { fill: #089981; }
    .body.down { fill: #f23645; }
    .body.active { stroke: var(--mtb-text); stroke-width: 0.6; }
    .readout {
      position: absolute; left: 4px; right: 4px; bottom: 2px; text-align: center;
      background: var(--mtb-panel); color: var(--mtb-text); border: 1px solid var(--mtb-border);
      border-radius: 6px; padding: 1px 4px; font-size: 10px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis; pointer-events: none;
    }
    .empty { height: 96px; display: grid; place-items: center; color: var(--mtb-muted); }
  `,
})
export class MiniCandlesComponent {
  readonly candles = input.required<Candle[]>();
  readonly ariaLabel = input('');
  /** App language for number formatting ('en', 'nl'). */
  readonly locale = input<string | undefined>(undefined);

  readonly hover = signal<number | null>(null);

  /** Everything the template reads, precomputed (templates must not call methods). */
  readonly candlesVm = computed(() => {
    const candles = this.candles();
    if (!candles.length) return null;
    const hover = this.hover();
    const high = Math.max(...candles.map((c) => c.High));
    const low = Math.min(...candles.map((c) => c.Low));
    const span = high - low || 1;
    const y = (v: number) => PAD + (1 - (v - low) / span) * (HEIGHT - PAD * 2);
    const slot = WIDTH / candles.length;
    const bodyW = Math.max(1, slot * 0.7);
    const items: CandleShape[] = candles.map((c, i) => {
      const top = y(Math.max(c.Open, c.Close));
      const bottom = y(Math.min(c.Open, c.Close));
      const x = slot * i + slot / 2;
      return {
        x,
        bodyX: x - bodyW / 2,
        active: hover === i,
        bodyY: top,
        bodyH: Math.max(0.8, bottom - top),
        wickTop: y(c.High),
        wickBottom: y(c.Low),
        up: c.Close >= c.Open,
      };
    });
    const h = hover === null ? null : candles[hover];
    const fmt = (v: number) => formatPrice(v, this.locale());
    return {
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      label: this.ariaLabel(),
      items,
      bodyW,
      readout: h
        ? `O ${fmt(h.Open)} · H ${fmt(h.High)} · L ${fmt(h.Low)} · C ${fmt(h.Close)}`
        : null,
    };
  });

  onMove(event: PointerEvent): void {
    const target = event.currentTarget as SVGElement;
    const rect = target.getBoundingClientRect();
    const count = this.candles().length;
    if (!rect.width || !count) return;
    const ratio = Math.min(0.9999, Math.max(0, (event.clientX - rect.left) / rect.width));
    this.hover.set(Math.floor(ratio * count));
  }
}

/** Price with sensible precision: fewer decimals for large prices. */
export function formatPrice(value: number, locale?: string): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 5;
  return value.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
