import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  input,
  signal,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import type { Chart, Plugin } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { MCB_LEVELS, McbSideValue } from './mcb-indicator';

/** Vertical geometry of the MCB plot (CSS px), captured after each Chart.js layout. */
export interface McbPlotGeometry {
  top: number;
  bottom: number;
  min: number;
  max: number;
}

export interface McbSideLabel {
  key: string;
  value: number;
  top: number;
  kind: 'value' | 'level';
  color: string | null;
  textColor: string | null;
}

/** Chip height (px) used for collision layout; keep in sync with .mcb-side-value. */
export const MCB_CHIP_HEIGHT = 15;
const CHIP_GAP = 1;

/**
 * Place value chips at the y of their value (TradingView-style price labels),
 * pushing overlapping chips apart, and add level labels that don't collide.
 */
export function layoutMcbSideLabels(
  values: McbSideValue[],
  geometry: McbPlotGeometry | null,
): McbSideLabel[] {
  if (!geometry || geometry.bottom <= geometry.top || geometry.max <= geometry.min) return [];
  const { top, bottom, min, max } = geometry;
  const toPx = (v: number) => {
    const clamped = Math.min(max, Math.max(min, v));
    return top + ((max - clamped) / (max - min)) * (bottom - top);
  };
  const half = MCB_CHIP_HEIGHT / 2;
  const step = MCB_CHIP_HEIGHT + CHIP_GAP;

  const chips = values
    .map((v) => ({ v, center: toPx(v.value) }))
    .sort((a, b) => a.center - b.center);
  // Push down from the top, then back up from the bottom so nothing leaves the plot.
  for (let i = 0; i < chips.length; i++) {
    const minCenter = i === 0 ? top + half : chips[i - 1].center + step;
    chips[i].center = Math.max(chips[i].center, minCenter);
  }
  for (let i = chips.length - 1; i >= 0; i--) {
    const maxCenter = i === chips.length - 1 ? bottom - half : chips[i + 1].center - step;
    chips[i].center = Math.max(top + half, Math.min(chips[i].center, maxCenter));
  }

  const labels: McbSideLabel[] = chips.map(({ v, center }) => ({
    key: v.key,
    value: v.value,
    top: Math.round(center - half),
    kind: 'value',
    color: v.color,
    textColor: v.textColor,
  }));

  // Levels in MCB_LEVELS order; one that would touch a chip or an earlier level is skipped.
  const taken = chips.map((c) => c.center);
  for (const level of MCB_LEVELS) {
    if (!level.labelled || level.value < min || level.value > max) continue;
    const center = toPx(level.value);
    if (center - half < top || center + half > bottom) continue;
    if (taken.some((c) => Math.abs(c - center) < MCB_CHIP_HEIGHT)) continue;
    taken.push(center);
    labels.push({
      key: `level:${level.value}`,
      value: level.value,
      top: Math.round(center - half),
      kind: 'level',
      color: null,
      textColor: null,
    });
  }
  return labels;
}

/** Manual y-range of the MCB plot; null = auto (the options' default range). */
export interface McbYRange {
  min: number;
  max: number;
}

const MIN_Y_SPAN = 10;
const MAX_Y_SPAN = 2000;
/** Drag sensitivity: 100px of vertical drag scales the range by e^0.6 (~1.8x). */
const DRAG_SCALE_PER_PX = 0.006;

/**
 * Scale a y-range around its center (TradingView price-scale stretch).
 * factor < 1 zooms in, > 1 zooms out; the span is clamped to sane limits.
 */
export function scaleMcbYRange(range: McbYRange, factor: number): McbYRange {
  const center = (range.min + range.max) / 2;
  const span = Math.min(MAX_Y_SPAN, Math.max(MIN_Y_SPAN, (range.max - range.min) * factor));
  return { min: center - span / 2, max: center + span / 2 };
}

function sameGeometry(a: McbPlotGeometry | null, b: McbPlotGeometry | null): boolean {
  return (
    a === b ||
    (!!a && !!b && a.top === b.top && a.bottom === b.bottom && a.min === b.min && a.max === b.max)
  );
}

/**
 * Market Cipher B oscillator panel rendered below the main candlestick chart
 * (via ChartBaseComponent.auxPanel). Purely presentational: the page component
 * computes the datasets and keeps the x-range linked to the main chart.
 */
@Component({
  selector: 'app-mcb-panel',
  standalone: true,
  imports: [BaseChartDirective, DecimalPipe, TranslateModule],
  template: `
    <div class="mcb-panel" [style.--linked-axis-width.px]="axisWidthPx()">
      <div class="mcb-panel__title">{{ 'CHART.MARKET_CIPHER_B' | translate }}</div>
      <div class="mcb-panel__body">
        <div class="mcb-plot" (wheel)="onPlotWheel($event)">
          <canvas baseChart [data]="chartData()" [options]="chartOptions()" [plugins]="plugins" [type]="'line'" #mcbCanvas data-linked-panel="mcb"></canvas>
        </div>
        <div
          class="mcb-axis-gutter"
          [class.mcb-axis-gutter--dragging]="dragging()"
          (pointerdown)="onAxisPointerDown($event)"
          (pointermove)="onAxisPointerMove($event)"
          (pointerup)="onAxisPointerUp($event)"
          (pointercancel)="onAxisPointerUp($event)"
          (wheel)="onAxisWheel($event)"
          (dblclick)="resetYZoom()"
        >
          @for (label of sideLabels(); track label.key) {
            <div
              class="mcb-side-value"
              [class.mcb-side-value--level]="label.kind === 'level'"
              [attr.data-key]="label.key"
              [style.top.px]="label.top"
              [style.background]="label.color"
              [style.color]="label.textColor"
            >
              {{ label.value | number: (label.kind === 'level' ? '1.0-0' : '1.1-1') }}
            </div>
          }
          @if (yRange()) {
            <button
              type="button"
              class="mcb-auto-scale"
              [title]="'CHART.MCB_AUTO_SCALE' | translate"
              [attr.aria-label]="'CHART.MCB_AUTO_SCALE' | translate"
              (pointerdown)="$event.stopPropagation()"
              (click)="resetYZoom()"
            >A</button>
          }
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./mcb-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McbPanelComponent implements OnDestroy {
  readonly chartData = input.required<any>();
  readonly chartOptions = input.required<any>();
  readonly sideValues = input<McbSideValue[]>([]);
  readonly axisWidthPx = input(72);
  /** Wheel over the plot area; the page forwards it to the main chart's time zoom. */
  readonly plotWheel = input<((event: WheelEvent) => void) | null>(null);

  @ViewChild('mcbCanvas', { read: BaseChartDirective }) chart?: BaseChartDirective;
  @ViewChild('mcbCanvas', { read: ElementRef }) canvasEl?: ElementRef<HTMLCanvasElement>;

  readonly geometry = signal<McbPlotGeometry | null>(null, { equal: sameGeometry });
  readonly sideLabels = computed(() => layoutMcbSideLabels(this.sideValues(), this.geometry()));

  /** Manual vertical zoom (null = auto). Kept here, not in the options: ng2-charts re-merges options on every data change. */
  readonly yRange = signal<McbYRange | null>(null);
  readonly dragging = signal(false);

  private drag: { pointerId: number; startY: number; startRange: McbYRange } | null = null;
  private updateRaf: number | null = null;

  readonly plugins: Plugin<'line'>[] = [
    {
      id: 'mcbPanel',
      // After ticks are built and before the scale is configured, so pixel mapping uses the manual range.
      afterBuildTicks: (_chart, args: any) => {
        const range = this.yRange();
        const scale = args?.scale;
        if (!range || scale?.id !== 'y') return;
        scale.min = range.min;
        scale.max = range.max;
      },
      afterLayout: (chart) => this.captureGeometry(chart),
      beforeDatasetsDraw: (chart) => drawLevels(chart),
      afterDatasetsDraw: (chart) => drawLatestCandleGuide(chart),
    },
  ];

  ngOnDestroy(): void {
    if (this.updateRaf != null) cancelAnimationFrame(this.updateRaf);
    this.updateRaf = null;
  }

  // ── Vertical zoom (TradingView price-scale behaviour) ──────────────────────

  /** Current visible y-range: the manual one, else what the chart rendered, else the options' default. */
  private currentYRange(): McbYRange {
    const manual = this.yRange();
    if (manual) return manual;
    const y = (this.chart?.chart as any)?.scales?.['y'];
    if (Number.isFinite(y?.min) && Number.isFinite(y?.max) && y.max > y.min) {
      return { min: y.min, max: y.max };
    }
    const opts = this.chartOptions()?.scales?.y;
    return { min: Number(opts?.min ?? -110), max: Number(opts?.max ?? 110) };
  }

  private setYRange(range: McbYRange | null): void {
    this.yRange.set(range);
    this.scheduleChartUpdate();
  }

  resetYZoom(): void {
    if (!this.yRange()) return;
    this.setYRange(null);
  }

  onAxisWheel(event: WheelEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!event.deltaY) return;
    this.setYRange(scaleMcbYRange(this.currentYRange(), event.deltaY > 0 ? 1.1 : 1 / 1.1));
  }

  onAxisPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    this.drag = { pointerId: event.pointerId, startY: event.clientY, startRange: this.currentYRange() };
    this.dragging.set(true);
    try {
      (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
    } catch {}
  }

  onAxisPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dy = event.clientY - drag.startY;
    if (!dy && !this.yRange()) return;
    // Drag down compresses (zoom out), drag up stretches (zoom in).
    this.setYRange(scaleMcbYRange(drag.startRange, Math.exp(dy * DRAG_SCALE_PER_PX)));
  }

  onAxisPointerUp(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    this.dragging.set(false);
    try {
      (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
    } catch {}
  }

  onPlotWheel(event: WheelEvent): void {
    const handler = this.plotWheel();
    if (handler) handler(event);
  }

  /** One Chart.js update per frame while dragging. */
  private scheduleChartUpdate(): void {
    if (this.updateRaf != null) return;
    this.updateRaf = requestAnimationFrame(() => {
      this.updateRaf = null;
      try {
        this.chart?.chart?.update('none');
      } catch {}
    });
  }

  private captureGeometry(chart: Chart): void {
    const area = chart.chartArea;
    const y = chart.scales?.['y'];
    if (!area || !y || !Number.isFinite(y.min) || !Number.isFinite(y.max)) return;
    this.geometry.set({ top: area.top, bottom: area.bottom, min: y.min, max: y.max });
  }
}

/**
 * Vertical dashed line at the latest candle, continuing the main chart's
 * latestCandleGuide line through the panel (same style; x-ranges are linked).
 */
function drawLatestCandleGuide(chart: Chart): void {
  const area = chart.chartArea;
  const x = chart.scales?.['x'];
  if (!area || !x) return;
  let latest = -Infinity;
  for (const ds of chart.data.datasets as any[]) {
    const last = ds?.type === 'scatter' ? null : ds?.data?.[ds.data.length - 1];
    const v = Number(last?.x);
    if (Number.isFinite(v) && v > latest) latest = v;
  }
  if (!Number.isFinite(latest)) return;
  const px = x.getPixelForValue(latest);
  if (!Number.isFinite(px) || px < area.left || px > area.right) return;
  const ctx = chart.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, area.bottom);
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(190, 196, 210, 0.7)';
  ctx.stroke();
  ctx.restore();
}

/** Horizontal MCB levels across the plot area (replaces one dataset per level). */
function drawLevels(chart: Chart): void {
  const area = chart.chartArea;
  const y = chart.scales?.['y'];
  if (!area || !y) return;
  const ctx = chart.ctx;
  ctx.save();
  for (const level of MCB_LEVELS) {
    if (level.value < y.min || level.value > y.max) continue;
    const py = Math.round(y.getPixelForValue(level.value)) + 0.5;
    ctx.beginPath();
    ctx.strokeStyle = level.color;
    ctx.lineWidth = level.width;
    ctx.setLineDash(level.dash);
    ctx.moveTo(area.left, py);
    ctx.lineTo(area.right, py);
    ctx.stroke();
  }
  ctx.restore();
}
