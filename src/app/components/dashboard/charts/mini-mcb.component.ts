import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Candle } from 'src/app/modules/shared/models/chart/candle.dto';
import { MCB_COLORS, MCB_SETTINGS, computeMcbSeries } from '../../market-cipher-b-chart/mcb-indicator';

const WIDTH = 240;
const HEIGHT = 64;
const PAD = 2;

let nextId = 0;

/**
 * Small Market Cipher B panel (WaveTrend, money flow, crosses) for the last
 * `visible` candles. The series is computed over all candles so the warm-up
 * (money flow needs ~65 bars) falls outside the visible part. Plain SVG.
 */
@Component({
  selector: 'app-mini-mcb',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (mcbVm(); as vm) {
      <svg class="mcb" [attr.viewBox]="vm.viewBox" preserveAspectRatio="none" role="img" [attr.aria-label]="vm.label">
        <defs>
          <clipPath [attr.id]="vm.upClip"><rect x="0" y="0" [attr.width]="vm.width" [attr.height]="vm.zero" /></clipPath>
          <clipPath [attr.id]="vm.downClip">
            <rect x="0" [attr.y]="vm.zero" [attr.width]="vm.width" [attr.height]="vm.height" />
          </clipPath>
        </defs>
        @for (l of vm.levels; track $index) {
          <line class="level" [class.zero]="l.zero" x1="0" [attr.x2]="vm.width" [attr.y1]="l.y" [attr.y2]="l.y"
            vector-effect="non-scaling-stroke" />
        }
        <path [attr.d]="vm.mf" [attr.fill]="colors.mfUpFill" [attr.clip-path]="vm.upClipUrl" />
        <path [attr.d]="vm.mf" [attr.fill]="colors.mfDownFill" [attr.clip-path]="vm.downClipUrl" />
        <path [attr.d]="vm.wt1" [attr.fill]="colors.wt1Fill" />
        <path [attr.d]="vm.wt2" [attr.fill]="colors.wt2Fill" />
        @for (c of vm.crosses; track $index) {
          <circle [attr.cx]="c.x" [attr.cy]="c.y" [attr.r]="c.r" [attr.fill]="c.color" />
        }
      </svg>
    } @else {
      <div class="empty">—</div>
    }
  `,
  styles: `
    :host { display: block; }
    .mcb { display: block; width: 100%; height: 64px; background: rgba(0, 0, 0, 0.25); border-radius: 4px; }
    .level { stroke: rgba(255, 255, 255, 0.18); stroke-width: 1; stroke-dasharray: 2 3; }
    .level.zero { stroke: rgba(255, 255, 255, 0.45); stroke-dasharray: none; }
    .empty { height: 64px; display: grid; place-items: center; color: var(--mtb-muted); }
  `,
})
export class MiniMcbComponent {
  readonly candles = input.required<Candle[]>();
  /** How many of the last candles to draw. */
  readonly visible = input(60);
  readonly ariaLabel = input('');

  readonly colors = MCB_COLORS;
  private readonly _id = nextId++;

  /** Everything the template reads, precomputed (templates must not call methods). */
  readonly mcbVm = computed(() => {
    const candles = this.candles();
    const series = computeMcbSeries(
      candles.map((c, i) => ({ x: i, h: c.High, l: c.Low, c: c.Close })),
    );
    if (!series) return null;
    const count = Math.min(this.visible(), series.x.length);
    const start = series.x.length - count;
    const wt1 = series.wt1.slice(start);
    const wt2 = series.wt2.slice(start);
    const mf = series.mf.slice(start);
    if (!wt2.some((v) => v != null)) return null;

    const peak = Math.max(
      MCB_SETTINGS.obLevel + 10,
      ...[...wt1, ...wt2, ...mf].map((v) => (v == null ? 0 : Math.abs(v))),
    );
    const y = (v: number) => PAD + (1 - (Math.max(-peak, Math.min(peak, v)) + peak) / (2 * peak)) * (HEIGHT - PAD * 2);
    const slot = WIDTH / count;
    const xAt = (i: number) => slot * i + slot / 2;
    const zero = y(0);
    const area = (values: Array<number | null>) => areaPath(values, xAt, y, zero);

    const crosses = series.crosses
      .filter((c) => c.x >= start)
      .map((c) => {
        const signal = c.up ? c.y <= MCB_SETTINGS.osLevel : c.y >= MCB_SETTINGS.obLevel;
        return {
          x: xAt(c.x - start),
          y: y(c.y),
          r: signal ? 3.2 : 1.8,
          color: c.up ? MCB_COLORS.buy : MCB_COLORS.sell,
        };
      });
    const levels = [MCB_SETTINGS.obLevel, 0, MCB_SETTINGS.osLevel].map((v) => ({ y: y(v), zero: v === 0 }));
    const upClip = `mini-mcb-up-${this._id}`;
    const downClip = `mini-mcb-down-${this._id}`;
    return {
      viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
      width: WIDTH,
      height: HEIGHT,
      label: this.ariaLabel(),
      zero,
      upClip,
      downClip,
      upClipUrl: `url(#${upClip})`,
      downClipUrl: `url(#${downClip})`,
      levels,
      mf: area(mf),
      wt1: area(wt1),
      wt2: area(wt2),
      crosses,
    };
  });
}

/** Filled area between the series and the zero line, one closed shape per run of defined values. */
function areaPath(
  values: Array<number | null>,
  xAt: (i: number) => number,
  y: (v: number) => number,
  zero: number,
): string {
  let d = '';
  let run: string[] = [];
  let runStart = 0;
  const flush = (end: number) => {
    if (run.length) d += `M${xAt(runStart).toFixed(1)},${zero.toFixed(1)}L${run.join('L')}L${xAt(end).toFixed(1)},${zero.toFixed(1)}Z`;
    run = [];
  };
  values.forEach((v, i) => {
    if (v == null) {
      flush(i - 1);
      return;
    }
    if (!run.length) runStart = i;
    run.push(`${xAt(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  flush(values.length - 1);
  return d;
}
