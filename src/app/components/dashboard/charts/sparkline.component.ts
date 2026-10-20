import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

const WIDTH = 300;
const HEIGHT = 64;
const PAD = 3;

/**
 * Single-series line (2px) with an area wash and a hover crosshair that reads
 * out the value under the pointer. Colours come from the --mtb-* tokens.
 */
@Component({
  selector: 'app-sparkline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sparkVm(); as vm) {
      <svg
        class="spark"
        [attr.viewBox]="vm.viewBox"
        preserveAspectRatio="none"
        role="img"
        [attr.aria-label]="vm.label"
        (pointermove)="onMove($event)"
        (pointerleave)="hover.set(null)"
      >
        <path class="area" [attr.d]="vm.area" />
        <path class="line" [attr.d]="vm.line" vector-effect="non-scaling-stroke" />
        @if (vm.cross; as c) {
          <line class="cross" [attr.x1]="c.x" [attr.x2]="c.x" y1="0" [attr.y2]="vm.height" vector-effect="non-scaling-stroke" />
        }
      </svg>
      @if (vm.cross; as c) {
        <div class="readout" [style.left.%]="c.leftPct">{{ c.text }}</div>
      }
    }
  `,
  styles: `
    :host { display: block; position: relative; }
    .spark { display: block; width: 100%; height: 64px; touch-action: pan-y; }
    .line { fill: none; stroke: var(--mtb-orange); stroke-width: 2; stroke-linejoin: round; }
    .area { fill: rgba(var(--mtb-orange-rgb), 0.12); stroke: none; }
    .cross { stroke: var(--mtb-muted); stroke-width: 1; stroke-dasharray: 3 3; }
    .readout {
      position: absolute; top: -6px; transform: translate(-50%, -100%);
      background: var(--mtb-panel); color: var(--mtb-text); border: 1px solid var(--mtb-border);
      border-radius: 6px; padding: 2px 6px; font-size: 11px; white-space: nowrap; pointer-events: none;
    }
  `,
})
export class SparklineComponent {
  readonly values = input.required<number[]>();
  readonly ariaLabel = input('');
  readonly format = input<(v: number) => string>((v) => v.toLocaleString());

  readonly hover = signal<number | null>(null);

  private readonly geometry = computed(() => {
    const values = this.values();
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const step = WIDTH / (values.length - 1);
    const points = values.map((v, i) => ({
      x: i * step,
      y: PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2),
    }));
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    return { line, area: `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`, step };
  });

  /** Everything the template reads, precomputed (templates must not call methods). */
  readonly sparkVm = computed(() => {
    const g = this.geometry();
    if (!g) return null;
    const index = this.hover();
    const x = index === null ? 0 : index * g.step;
    return {
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      height: HEIGHT,
      line: g.line,
      area: g.area,
      label: this.ariaLabel(),
      cross:
        index === null
          ? null
          : { x, leftPct: (x / WIDTH) * 100, text: this.format()(this.values()[index]) },
    };
  });

  onMove(event: PointerEvent): void {
    const target = event.currentTarget as SVGElement;
    const rect = target.getBoundingClientRect();
    const count = this.values().length;
    if (!rect.width || count < 2) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    this.hover.set(Math.round(ratio * (count - 1)));
  }
}
