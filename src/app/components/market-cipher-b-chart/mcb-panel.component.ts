import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
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
        <div class="mcb-plot">
          <canvas baseChart [data]="chartData()" [options]="chartOptions()" [plugins]="plugins" [type]="'line'" #mcbCanvas data-linked-panel="mcb"></canvas>
        </div>
        <div class="mcb-axis-gutter">
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
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./mcb-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McbPanelComponent {
  readonly chartData = input.required<any>();
  readonly chartOptions = input.required<any>();
  readonly sideValues = input<McbSideValue[]>([]);
  readonly axisWidthPx = input(72);

  @ViewChild('mcbCanvas', { read: BaseChartDirective }) chart?: BaseChartDirective;
  @ViewChild('mcbCanvas', { read: ElementRef }) canvasEl?: ElementRef<HTMLCanvasElement>;

  readonly geometry = signal<McbPlotGeometry | null>(null, { equal: sameGeometry });
  readonly sideLabels = computed(() => layoutMcbSideLabels(this.sideValues(), this.geometry()));

  readonly plugins: Plugin<'line'>[] = [
    {
      id: 'mcbPanel',
      afterLayout: (chart) => this.captureGeometry(chart),
      beforeDatasetsDraw: (chart) => drawLevels(chart),
    },
  ];

  private captureGeometry(chart: Chart): void {
    const area = chart.chartArea;
    const y = chart.scales?.['y'];
    if (!area || !y || !Number.isFinite(y.min) || !Number.isFinite(y.max)) return;
    this.geometry.set({ top: area.top, bottom: area.bottom, min: y.min, max: y.max });
  }
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
