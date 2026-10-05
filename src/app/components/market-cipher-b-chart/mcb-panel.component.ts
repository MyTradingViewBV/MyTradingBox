import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import type { Chart, Plugin } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import {
  CROSSHAIR_DASH,
  CROSSHAIR_LINE_COLOR,
  crosshairPixelX,
  drawCrosshairTimeLabel,
} from '../chart/services/chart-plugins';
import type { CrosshairSource } from '../chart/services/chart-interaction.service';
import { DoubleTapDetector } from '../chart/utils/double-tap';
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
  kind: 'value' | 'tick';
  color: string | null;
  textColor: string | null;
}

/** Value tag height (px) used for collision layout; keep in sync with .mcb-axis-tag. */
export const MCB_CHIP_HEIGHT = 16;
const CHIP_GAP = 1;
/** Nice tick steps for the value axis; the smallest that keeps ticks this far apart wins. */
const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const MIN_TICK_SPACING_PX = 28;

/** Round-number ticks inside [min, max], spaced like the main chart's price axis. */
export function mcbAxisTicks(min: number, max: number, heightPx: number): number[] {
  if (!(max > min) || !(heightPx > 0)) return [];
  const pxPerUnit = heightPx / (max - min);
  const step = TICK_STEPS.find((s) => s * pxPerUnit >= MIN_TICK_SPACING_PX) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6 || 0);
  }
  return ticks;
}

/**
 * TradingView-style value axis: coloured value tags at the y of their value
 * (overlapping tags pushed apart) plus plain round-number ticks that do not
 * collide with a tag.
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

  // Ticks that would touch a value tag or the plot edge are skipped.
  for (const tick of mcbAxisTicks(min, max, bottom - top)) {
    const center = toPx(tick);
    if (center - half < top || center + half > bottom) continue;
    if (chips.some((c) => Math.abs(c.center - center) < MCB_CHIP_HEIGHT)) continue;
    labels.push({
      key: `tick:${tick}`,
      value: tick,
      top: Math.round(center - half),
      kind: 'tick',
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
/** Vertical drag (px) on the plot before it starts moving the y-range, so a time pan doesn't leave auto scale. */
const Y_PAN_THRESHOLD_PX = 6;

/** Shift a y-range by a vertical drag on the plot: drag down moves the content down (TradingView pane pan). */
export function panMcbYRange(range: McbYRange, deltaYPx: number, plotHeightPx: number): McbYRange {
  if (!(plotHeightPx > 0) || !deltaYPx) return range;
  const shift = (deltaYPx / plotHeightPx) * (range.max - range.min);
  return { min: range.min + shift, max: range.max + shift };
}

/**
 * Scale a y-range around its center (TradingView price-scale stretch).
 * factor < 1 zooms in, > 1 zooms out; the span is clamped to sane limits.
 */
export function scaleMcbYRange(range: McbYRange, factor: number): McbYRange {
  const center = (range.min + range.max) / 2;
  const span = Math.min(MAX_Y_SPAN, Math.max(MIN_Y_SPAN, (range.max - range.min) * factor));
  return { min: center - span / 2, max: center + span / 2 };
}

/** Panel height limits (px) for the top-edge resize drag. */
export const MCB_MIN_PANEL_HEIGHT = 80;
/** Upper limit as a fraction of the chart area, so the main chart keeps some room. */
const MCB_MAX_PANEL_FRACTION = 0.75;
const PANEL_HEIGHT_STORAGE_KEY = 'mtb.mcbPanelHeight';

export function clampMcbPanelHeight(height: number, available: number): number {
  const max = Math.max(MCB_MIN_PANEL_HEIGHT, available * MCB_MAX_PANEL_FRACTION);
  return Math.round(Math.min(max, Math.max(MCB_MIN_PANEL_HEIGHT, height)));
}

function readStoredPanelHeight(): number | null {
  try {
    const v = Number(localStorage.getItem(PANEL_HEIGHT_STORAGE_KEY));
    return Number.isFinite(v) && v >= MCB_MIN_PANEL_HEIGHT ? v : null;
  } catch {
    return null;
  }
}

function storePanelHeight(height: number | null): void {
  try {
    if (height == null) localStorage.removeItem(PANEL_HEIGHT_STORAGE_KEY);
    else localStorage.setItem(PANEL_HEIGHT_STORAGE_KEY, String(height));
  } catch {}
}

function sameGeometry(a: McbPlotGeometry | null, b: McbPlotGeometry | null): boolean {
  return (
    a === b ||
    (!!a && !!b && a.top === b.top && a.bottom === b.bottom && a.min === b.min && a.max === b.max)
  );
}

/**
 * Gestures on the MCB plot, handled by the page against the main chart (the
 * panel shares its time axis), so the panel behaves like a TradingView pane.
 */
export interface McbPlotHost {
  /** Wheel over the plot: zoom time around the cursor. */
  wheel(event: WheelEvent): void;
  /** Crosshair at a viewport position in either pane; null hides it unless a touch crosshair is pinned. */
  crosshair(clientX: number | null, clientY?: number | null): void;
  /** Hide the crosshair, also a pinned touch crosshair (tap to dismiss). */
  dismissCrosshair(): void;
  isCrosshairPinned(): boolean;
  /** Pin the touch crosshair (long-press) so dragging moves it instead of panning. */
  pinCrosshair(): void;
  /**
   * Pan from the pointer's clientX; `panTo` moves to a clientX (total dx from the start, not per event).
   * False = refused (another gesture runs): the pane must not start its pan.
   */
  panStart(clientX: number): boolean;
  panTo(clientX: number): void;
  panEnd(): void;
  /**
   * Two-finger pinch: `distance` between the fingers (px), `paneCenterX` their centroid across this pane's plot
   * (px from its left edge; NaN = unknown). False when nothing started.
   */
  pinchStart(distance: number, paneCenterX: number): boolean;
  /** Scale to the current distance/centroid, computed from the pinch start (the time under the centroid follows it). */
  pinchTo(distance: number, paneCenterX: number): void;
  pinchEnd(): void;
  /** Double-click / double-tap on the time axis: horizontal scale reset (default bar spacing, Y mode untouched). */
  resetTimeScale(): void;
  /**
   * Time-axis drag (anchored bar-spacing scale): `plotX` is the press position across the plot (px from its left edge).
   * False when nothing started.
   */
  timeAxisScaleStart(clientX: number, plotX: number): boolean;
  /** Scale to the pointer at `clientX`, computed from the press. */
  timeAxisScaleTo(clientX: number): void;
  timeAxisScaleEnd(): void;
  /**
   * A press (mouse button / first finger) starts on the plot: drags whose release was lost are dropped first.
   * False = nothing may start (the value-axis drag or a pinch runs). Without it every press may start.
   */
  beginPress?(pointer: 'mouse' | 'touch'): boolean;
  /** Register the value-axis drag with the page's one-gesture rule; false = refused (another gesture runs). */
  claimValueScale?(): boolean;
  /** The value-axis drag ended (every end path: release, cancel, lost capture, blur, destroy). */
  releaseValueScale?(): void;
  /** True while any gesture runs on the page (pane or main chart). */
  isGestureActive?(): boolean;
  /** One of the two clicks of a double click was a drag: it is no double click (no reset). */
  doubleClickFollowsDrag?(): boolean;
}

/** Same thresholds as the main chart (ChartInteractionService). */
const LONG_PRESS_MS = 300;
const TOUCH_PAN_THRESHOLD_PX = 10;
interface PlotTouch {
  lastX: number;
  startX: number;
  startY: number;
  time: number;
  moved: boolean;
  mode: 'pending' | 'pan' | 'crosshair' | 'pinch' | 'zoom-x';
  pinchDistance: number;
}

function touchDistance(touches: TouchList): number {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

/**
 * Market Cipher B oscillator panel rendered below the main candlestick chart
 * (via ChartBaseComponent.auxPanel). Presentational: the page computes the
 * datasets, keeps the x-range linked to the main chart and handles the plot
 * gestures through `host`.
 */
@Component({
  selector: 'app-mcb-panel',
  standalone: true,
  imports: [BaseChartDirective, DecimalPipe, TranslateModule],
  template: `
    <div
      class="mcb-splitter"
      role="separator"
      aria-orientation="horizontal"
      tabindex="0"
      [class.mcb-splitter--dragging]="resizing()"
      (pointerdown)="onResizePointerDown($event)"
      (pointermove)="onResizePointerMove($event)"
      (pointerup)="onResizePointerUp($event)"
      (pointercancel)="onResizePointerUp($event)"
      (keydown)="onSplitterKeyDown($event)"
      (dblclick)="resetPanelHeight()"
    ></div>
    <div class="mcb-panel" #panelEl [style.--linked-axis-width.px]="axisWidthPx()" [style.height.px]="panelHeight()">
      <div class="mcb-panel__title">{{ 'CHART.MARKET_CIPHER_B' | translate }}</div>
      <div class="mcb-panel__body">
        <div
          class="mcb-plot"
          [class.mcb-plot--panning]="panning()"
          [class.mcb-plot--time-axis]="overTimeAxis() || zoomingTime()"
          (wheel)="onPlotWheel($event)"
          (mousedown)="onPlotMouseDown($event)"
          (mousemove)="onPlotMouseMove($event)"
          (mouseleave)="onPlotMouseLeave()"
          (dblclick)="onPlotDblClick($event)"
          (touchstart)="onPlotTouchStart($event)"
          (touchmove)="onPlotTouchMove($event)"
          (touchend)="onPlotTouchEnd($event)"
          (touchcancel)="onPlotTouchEnd($event)"
        >
          <canvas baseChart [data]="boundData" [options]="chartOptions()" [plugins]="plugins" [type]="'line'" #mcbCanvas data-linked-panel="mcb"></canvas>
        </div>
        <div
          class="mcb-axis-gutter"
          [class.mcb-axis-gutter--dragging]="dragging()"
          (pointerdown)="onAxisPointerDown($event)"
          (pointermove)="onAxisPointerMove($event)"
          (pointerup)="onAxisPointerUp($event)"
          (pointercancel)="onAxisPointerUp($event)"
          (lostpointercapture)="onAxisPointerUp($event)"
          (wheel)="onAxisWheel($event)"
          (dblclick)="resetYZoom()"
        >
          @for (label of sideLabels(); track label.key) {
            @if (label.kind === 'tick') {
              <div class="mcb-axis-tick" [style.top.px]="label.top">{{ label.value | number: '1.0-0' }}</div>
            } @else {
              <div
                class="mcb-axis-tag"
                [attr.data-key]="label.key"
                [style.top.px]="label.top"
                [style.background]="label.color"
                [style.color]="label.textColor"
              >{{ label.value | number: '1.2-2' }}</div>
            }
          }
          @if (crosshairLabel(); as cross) {
            <div class="mcb-axis-tag mcb-axis-tag--crosshair" [style.top.px]="cross.top">
              {{ cross.value | number: '1.2-2' }}
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
  /** Plot gestures (pan, zoom, crosshair) forwarded to the main chart. */
  readonly host = input<McbPlotHost | null>(null);

  /**
   * Data object handed to ng2-charts once. Later `chartData` changes are applied
   * to it in place: passing a new object makes ng2-charts re-merge the options,
   * which drops the linked x-range and plot padding and redraws the whole pane.
   */
  protected readonly boundData: { datasets: any[] } = { datasets: [] };

  @ViewChild('mcbCanvas', { read: BaseChartDirective }) chart?: BaseChartDirective;
  @ViewChild('mcbCanvas', { read: ElementRef }) canvasEl?: ElementRef<HTMLCanvasElement>;
  @ViewChild('panelEl', { read: ElementRef }) panelEl?: ElementRef<HTMLElement>;

  readonly geometry = signal<McbPlotGeometry | null>(null, { equal: sameGeometry });
  readonly sideLabels = computed(() => layoutMcbSideLabels(this.sideValues(), this.geometry()));

  /** Manual vertical zoom (null = auto). Kept here, not in the options: ng2-charts re-merges options on every data change. */
  readonly yRange = signal<McbYRange | null>(null);
  readonly dragging = signal(false);

  /** User-chosen panel height (null = CSS default); dragged from the top edge, persisted per browser. */
  readonly panelHeight = signal<number | null>(readStoredPanelHeight());
  readonly resizing = signal(false);

  /** Shared crosshair (set by the page for both panes): time of the vertical line, y of the horizontal one here. */
  private crosshairTime: number | null = null;
  private crosshairY: number | null = null;
  /** Value tag on the axis while the crosshair's horizontal line is in this pane. */
  readonly crosshairLabel = signal<{ top: number; value: number } | null>(null);
  readonly panning = signal(false);
  /** Pointer over the time axis (below the plot area), or dragging it to zoom time. */
  readonly overTimeAxis = signal(false);
  readonly zoomingTime = signal(false);

  private drag: { pointerId: number; startY: number; startRange: McbYRange; handle: HTMLElement | null } | null = null;
  private resize: {
    pointerId: number;
    startY: number;
    startHeight: number;
    available: number;
    handle: HTMLElement | null;
  } | null = null;
  private updateRaf: number | null = null;
  private mousePanX: number | null = null;
  /** Set during a mouse drag on the time axis (TradingView); the page's TimeScale does the scaling. */
  private mouseZoomX: number | null = null;
  /** Vertical part of a plot drag: start position and y-range; `active` once past the threshold. */
  private yPan: { startY: number; startRange: McbYRange; active: boolean } | null = null;
  private touch: PlotTouch | null = null;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly timeAxisDoubleTap = new DoubleTapDetector();

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
      beforeDatasetsDraw: (chart) => {
        drawGrid(chart);
        drawLevels(chart);
      },
      afterDraw: (chart) => drawCrosshair(chart, this.crosshairTime, this.crosshairY),
    },
  ];

  constructor() {
    // New datasets are swapped into the existing chart and redrawn without animation.
    effect(() => {
      this.boundData.datasets = this.chartData()?.datasets ?? [];
      try {
        this.chart?.chart?.update('none');
      } catch {}
    });
  }

  ngOnDestroy(): void {
    if (this.updateRaf != null) cancelAnimationFrame(this.updateRaf);
    this.updateRaf = null;
    this.cancelLongPress();
    this.endResize();
    this.endAxisDrag();
    const zooming = this.mouseZoomX != null || this.touch?.mode === 'zoom-x';
    // A linked pan still running would leave the service in gesture 'pan' / isInteracting.
    const panning = this.mousePanX != null || this.touch?.mode === 'pan';
    this.stopMousePan();
    this.touch = null;
    if (panning) this.host()?.panEnd();
    if (zooming) this.host()?.timeAxisScaleEnd();
  }

  // ── Shared crosshair ───────────────────────────────────────────────────────

  /**
   * Called by the page whenever the crosshair moves in either pane: `time` is
   * the snapped candle time (null = hidden); the horizontal line and value tag
   * show here only when the pointer is in this pane (`source` 'pane') and `clientY` is inside this plot.
   */
  setCrosshair(time: number | null, clientY: number | null, source: CrosshairSource = 'pane'): void {
    const chart = this.chart?.chart as Chart | undefined;
    const area = chart?.chartArea;
    const canvas = this.canvasEl?.nativeElement;
    let y: number | null = null;
    // Horizontal line + value label only while the pointer itself is in this pane (never from a main-chart pointer).
    if (source === 'pane' && time != null && clientY != null && area && canvas) {
      const local = clientY - canvas.getBoundingClientRect().top;
      if (local >= area.top && local <= area.bottom) y = local;
    }
    if (time === this.crosshairTime && y === this.crosshairY) return;
    this.crosshairTime = time;
    this.crosshairY = y;
    const yScale = chart?.scales?.['y'];
    this.crosshairLabel.set(
      y != null && yScale
        ? { top: Math.round(y - MCB_CHIP_HEIGHT / 2), value: yScale.getValueForPixel(y) ?? 0 }
        : null,
    );
    try {
      chart?.draw();
    } catch {}
  }

  // ── Plot gestures (TradingView pane: drag = pan time, wheel/pinch = zoom time) ──

  onPlotWheel(event: WheelEvent): void {
    this.host()?.wheel(event);
  }

  onPlotMouseDown(event: MouseEvent): void {
    const host = this.host();
    if (event.button !== 0 || !host) return;
    event.preventDefault();
    // A drag of this pane whose release was lost must not keep running beside the new one.
    this.stopMousePan();
    if (host.isCrosshairPinned()) return;
    if (host.beginPress?.('mouse') === false) return;
    if (this.isOverTimeAxis(event.clientX, event.clientY)) {
      if (!host.timeAxisScaleStart(event.clientX, this.plotXAt(event.clientX))) return;
      this.mouseZoomX = event.clientX;
      this.zoomingTime.set(true);
      document.addEventListener('mousemove', this.onDocumentMouseMove);
      document.addEventListener('mouseup', this.onDocumentMouseUp);
      window.addEventListener('blur', this.onDocumentMouseUp);
      return;
    }
    if (host.panStart(event.clientX) === false) return;
    this.mousePanX = event.clientX;
    this.startYPan(event.clientY);
    this.panning.set(true);
    // Keep panning when the mouse leaves the panel, like the main chart's drag.
    document.addEventListener('mousemove', this.onDocumentMouseMove);
    document.addEventListener('mouseup', this.onDocumentMouseUp);
    window.addEventListener('blur', this.onDocumentMouseUp);
  }

  onPlotMouseMove(event: MouseEvent): void {
    if (this.mousePanX != null || this.mouseZoomX != null) return; // handled by the document listener
    this.overTimeAxis.set(this.isOverTimeAxis(event.clientX, event.clientY));
    this.host()?.crosshair(event.clientX, event.clientY);
  }

  onPlotDblClick(event: MouseEvent): void {
    if (this.host()?.doubleClickFollowsDrag?.()) return; // a drag was one of the clicks: no reset
    if (this.isOverTimeAxis(event.clientX, event.clientY)) this.host()?.resetTimeScale();
  }

  onPlotMouseLeave(): void {
    this.overTimeAxis.set(false);
    // While a drag captures the mouse the page defers the hide (and the gesture goes on) until it ends.
    this.host()?.crosshair(null);
  }

  private readonly onDocumentMouseMove = (event: MouseEvent): void => {
    const host = this.host();
    if (!host) return;
    if (this.mouseZoomX != null) {
      host.timeAxisScaleTo(event.clientX);
      return;
    }
    if (this.mousePanX == null) return;
    host.panTo(event.clientX);
    this.mousePanX = event.clientX;
    this.moveYPan(event.clientY);
    host.crosshair(event.clientX, event.clientY);
  };

  private readonly onDocumentMouseUp = (): void => {
    if (this.mouseZoomX != null) {
      this.stopMousePan();
      this.host()?.timeAxisScaleEnd();
      return;
    }
    if (this.mousePanX == null) return;
    this.stopMousePan();
    this.host()?.panEnd();
  };

  private stopMousePan(): void {
    this.mousePanX = null;
    this.mouseZoomX = null;
    this.yPan = null;
    this.panning.set(false);
    this.zoomingTime.set(false);
    document.removeEventListener('mousemove', this.onDocumentMouseMove);
    document.removeEventListener('mouseup', this.onDocumentMouseUp);
    window.removeEventListener('blur', this.onDocumentMouseUp);
  }

  /** Touch mirrors the main chart: drag = pan, pinch = zoom, long-press = crosshair (tap dismisses). */
  onPlotTouchStart(event: TouchEvent): void {
    event.preventDefault();
    const host = this.host();
    if (!host) return;
    if (event.touches.length === 1) {
      const t = event.touches[0];
      // A first finger: stale drags are dropped; nothing starts while the value-axis drag runs.
      if (host.beginPress?.('touch') === false) {
        this.cancelLongPress();
        this.touch = null;
        return;
      }
      this.touch = {
        lastX: t.clientX,
        startX: t.clientX,
        startY: t.clientY,
        time: Date.now(),
        moved: false,
        mode: host.isCrosshairPinned() ? 'crosshair' : 'pending',
        pinchDistance: 0,
      };
      if (this.touch.mode === 'crosshair') return;
      if (this.isOverTimeAxis(t.clientX, t.clientY)) {
        if (host.timeAxisScaleStart(t.clientX, this.plotXAt(t.clientX))) this.touch.mode = 'zoom-x';
        return;
      }
      this.cancelLongPress();
      this.longPressTimer = setTimeout(() => {
        this.longPressTimer = null;
        const touch = this.touch;
        if (touch?.mode !== 'pending') return;
        touch.mode = 'crosshair';
        host.pinCrosshair();
        host.crosshair(touch.startX, touch.startY);
      }, LONG_PRESS_MS);
    } else if (event.touches.length === 2) {
      this.cancelLongPress();
      if (this.touch?.mode === 'crosshair') return;
      // Pinch has priority: end a one-finger pan / time-axis drag first, never two gestures.
      if (this.touch?.mode === 'pan') host.panEnd();
      if (this.touch?.mode === 'zoom-x') host.timeAxisScaleEnd();
      this.yPan = null;
      const distance = touchDistance(event.touches);
      this.touch = {
        lastX: 0,
        startX: 0,
        startY: 0,
        time: Date.now(),
        moved: true,
        mode: 'pinch',
        pinchDistance: distance,
      };
      host.pinchStart(distance, this.touchCenterPlotX(event.touches));
    }
  }

  onPlotTouchMove(event: TouchEvent): void {
    event.preventDefault();
    const host = this.host();
    const touch = this.touch;
    if (!host || !touch) return;

    if (touch.mode === 'pinch') {
      if (event.touches.length !== 2) return;
      const distance = touchDistance(event.touches);
      if (distance > 0) host.pinchTo(distance, this.touchCenterPlotX(event.touches));
      return;
    }

    const t = event.touches[0];
    if (!t) return;
    const dx = t.clientX - touch.startX;
    const dy = t.clientY - touch.startY;
    if (Math.abs(dx) > TOUCH_PAN_THRESHOLD_PX || Math.abs(dy) > TOUCH_PAN_THRESHOLD_PX) touch.moved = true;
    if (touch.mode === 'zoom-x') {
      host.timeAxisScaleTo(t.clientX);
      return;
    }

    if (touch.mode === 'crosshair') {
      // Follows the finger into the main chart as well.
      host.crosshair(t.clientX, t.clientY);
      return;
    }
    if (touch.mode === 'pending' && touch.moved) {
      this.cancelLongPress();
      if (host.panStart(touch.startX) === false) {
        // Another gesture runs: this touch starts nothing.
        this.touch = null;
        return;
      }
      touch.mode = 'pan';
      this.startYPan(touch.startY);
    }
    if (touch.mode === 'pan') {
      host.panTo(t.clientX);
      touch.lastX = t.clientX;
      this.moveYPan(t.clientY);
    }
  }

  onPlotTouchEnd(event: TouchEvent): void {
    const host = this.host();
    if (event.touches.length === 1 && this.touch?.mode === 'pinch' && host) {
      // One finger of the pinch lifted: the remaining one continues as a fresh pan start (no shift, never a tap).
      const t = event.touches[0];
      host.pinchEnd();
      this.touch = { lastX: t.clientX, startX: t.clientX, startY: t.clientY, time: 0, moved: false, mode: 'pending', pinchDistance: 0 };
      return;
    }
    if (event.touches.length > 0) return;
    this.cancelLongPress();
    const touch = this.touch;
    this.touch = null;
    if (!host || !touch) return;
    if (touch.mode === 'pinch') host.pinchEnd();
    if (touch.mode === 'pan') host.panEnd();
    if (touch.mode === 'zoom-x') host.timeAxisScaleEnd();
    this.yPan = null;
    // touchcancel (bound here too: the browser took the touches) ends the gesture like a release but is never a tap.
    const isTap = event.type !== 'touchcancel' && !touch.moved && Date.now() - touch.time < LONG_PRESS_MS;
    if (isTap && host.isCrosshairPinned()) host.dismissCrosshair();
    // iOS fires no dblclick (touchstart is prevented): double-tap on the time axis here.
    if (!isTap || touch.mode !== 'zoom-x') {
      this.timeAxisDoubleTap.reset();
    } else if (this.timeAxisDoubleTap.tap(touch.startX, touch.startY)) {
      host.resetTimeScale();
    }
  }

  private startYPan(clientY: number): void {
    this.yPan = { startY: clientY, startRange: this.currentYRange(), active: false };
  }

  /** Vertical drag on the plot moves the MCB range (leaves auto scale, like TradingView; "A" resets). */
  private moveYPan(clientY: number): void {
    const pan = this.yPan;
    const geometry = this.geometry();
    if (!pan || !geometry) return;
    const dy = clientY - pan.startY;
    if (!pan.active && Math.abs(dy) < Y_PAN_THRESHOLD_PX) return;
    pan.active = true;
    this.setYRange(panMcbYRange(pan.startRange, dy, geometry.bottom - geometry.top));
  }

  /** Press position across this pane's plot (px from its left edge); frames match the main plot. */
  private plotXAt(clientX: number): number {
    const area = (this.chart?.chart as Chart | undefined)?.chartArea;
    const canvas = this.canvasEl?.nativeElement;
    if (!area || !canvas) return NaN;
    return clientX - canvas.getBoundingClientRect().left - area.left;
  }

  /** Centroid of the first two touches across this pane's plot (px from its left edge). */
  private touchCenterPlotX(touches: TouchList): number {
    return this.plotXAt((touches[0].clientX + touches[1].clientX) / 2);
  }

  /** Below the plot area, within its width: the time axis drawn by this pane's canvas. */
  private isOverTimeAxis(clientX: number, clientY: number): boolean {
    const area = (this.chart?.chart as Chart | undefined)?.chartArea;
    const canvas = this.canvasEl?.nativeElement;
    if (!area || !canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return x >= area.left && x <= area.right && y > area.bottom && y <= rect.height;
  }

  private cancelLongPress(): void {
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }

  // ── Splitter between main chart and panel (drag up = panel taller, main chart shrinks) ──

  onResizePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget as HTMLElement | null;
    const panel = this.panelEl?.nativeElement;
    if (!handle || !panel) return;
    this.resize = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: panel.getBoundingClientRect().height,
      available: this.availableHeight(panel),
      handle,
    };
    this.resizing.set(true);
    try {
      handle.setPointerCapture?.(event.pointerId);
    } catch {}
    // Alt-tab / focus loss mid-drag: no pointerup arrives, end the drag (height kept) instead of leaving it armed.
    window.addEventListener('blur', this.onResizeBlur);
  }

  onResizePointerMove(event: PointerEvent): void {
    const r = this.resize;
    if (!r || event.pointerId !== r.pointerId) return;
    this.panelHeight.set(clampMcbPanelHeight(r.startHeight - (event.clientY - r.startY), r.available));
  }

  onResizePointerUp(event: PointerEvent): void {
    if (!this.resize || event.pointerId !== this.resize.pointerId) return;
    this.endResize();
  }

  private readonly onResizeBlur = (): void => this.endResize();

  /** End a splitter drag (pointerup, window blur, destroy): keep and persist the height reached. */
  private endResize(): void {
    const r = this.resize;
    if (!r) return;
    this.resize = null;
    window.removeEventListener('blur', this.onResizeBlur);
    this.resizing.set(false);
    storePanelHeight(this.panelHeight());
    try {
      r.handle?.releasePointerCapture?.(r.pointerId);
    } catch {}
  }

  /** Arrow keys move the splitter (Shift = bigger steps), Home resets. */
  onSplitterKeyDown(event: KeyboardEvent): void {
    const panel = this.panelEl?.nativeElement;
    if (!panel) return;
    if (event.key === 'Home') {
      event.preventDefault();
      this.resetPanelHeight();
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const step = (event.shiftKey ? 50 : 10) * (event.key === 'ArrowUp' ? 1 : -1);
    const height = clampMcbPanelHeight(panel.getBoundingClientRect().height + step, this.availableHeight(panel));
    this.panelHeight.set(height);
    storePanelHeight(height);
  }

  resetPanelHeight(): void {
    this.panelHeight.set(null);
    storePanelHeight(null);
  }

  /** Height shared by the main chart and this panel (the chart area). */
  private availableHeight(panel: HTMLElement): number {
    return panel.parentElement?.getBoundingClientRect().height || window.innerHeight;
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
    // A drag (this axis' own or any page gesture) owns the scales: it would undo the wheel step.
    if (!event.deltaY || this.drag || this.host()?.isGestureActive?.()) return;
    this.setYRange(scaleMcbYRange(this.currentYRange(), event.deltaY > 0 ? 1.1 : 1 / 1.1));
  }

  onAxisPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    if (this.drag) this.endAxisDrag(); // a stale drag (lost release) never runs beside the new one
    // One gesture at a time, page-wide: refused while the main chart or the plot runs one.
    if (this.host()?.claimValueScale?.() === false) return;
    const handle = event.currentTarget as HTMLElement | null;
    this.drag = { pointerId: event.pointerId, startY: event.clientY, startRange: this.currentYRange(), handle };
    this.dragging.set(true);
    try {
      handle?.setPointerCapture?.(event.pointerId);
    } catch {}
    window.addEventListener('blur', this.onAxisDragBlur);
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
    this.endAxisDrag();
  }

  private readonly onAxisDragBlur = (): void => this.endAxisDrag();

  /** End a value-axis drag (pointerup, window blur, destroy): the y-range reached stays. */
  private endAxisDrag(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    window.removeEventListener('blur', this.onAxisDragBlur);
    this.dragging.set(false);
    this.host()?.releaseValueScale?.();
    try {
      drag.handle?.releasePointerCapture?.(drag.pointerId);
    } catch {}
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

/** Faint horizontal grid at the axis ticks (the main chart's grid colour). */
function drawGrid(chart: Chart): void {
  const area = chart.chartArea;
  const y = chart.scales?.['y'];
  if (!area || !y) return;
  const ctx = chart.ctx;
  ctx.save();
  ctx.strokeStyle = 'rgba(42,46,57,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const tick of mcbAxisTicks(y.min, y.max, area.bottom - area.top)) {
    const py = Math.round(y.getPixelForValue(tick)) + 0.5;
    ctx.moveTo(area.left, py);
    ctx.lineTo(area.right, py);
  }
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

/**
 * The shared crosshair in this pane: vertical line at the snapped candle time
 * (continuing the main chart's), horizontal line when the pointer is here, and
 * the time label on this pane's time axis (the main chart hides its own).
 */
function drawCrosshair(chart: Chart, time: number | null, y: number | null): void {
  const area = chart.chartArea;
  const xScale = chart.scales?.['x'];
  if (time == null || !area || !xScale) return;
  // Same mapping and edge clamp as the main chart's crosshair: this pane's own scale at the one shared time.
  const px = crosshairPixelX(xScale, area, time);
  if (px == null) return;
  const ctx = chart.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(px, area.top);
  ctx.lineTo(px, area.bottom);
  if (y != null) {
    ctx.moveTo(area.left, y);
    ctx.lineTo(area.right, y);
  }
  ctx.lineWidth = 1;
  ctx.setLineDash(CROSSHAIR_DASH);
  ctx.strokeStyle = CROSSHAIR_LINE_COLOR;
  ctx.stroke();
  ctx.restore();
  drawCrosshairTimeLabel(ctx, area, px, time, Math.min(area.bottom + 1, chart.height - 22));
}
