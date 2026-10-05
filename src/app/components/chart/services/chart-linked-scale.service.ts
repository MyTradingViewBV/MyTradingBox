import { Injectable } from '@angular/core';
import { Chart } from 'chart.js';
import { TimeScale, TimeRange, writeXRange } from '../scales/time-scale';

export interface LinkedChartRefLike {
  width?: number;
  canvas?: HTMLCanvasElement | null;
  chartArea?: { left: number; right: number; top: number; bottom: number };
  scales?: {
    x?: {
      min?: number;
      max?: number;
      options?: { min?: number; max?: number; offset?: boolean };
      getPixelForValue?: (value: number) => number;
    };
    y?: {
      width?: number;
      options?: Record<string, unknown>;
      afterFit?: (scale: { width: number }) => void;
    };
  };
  data?: { datasets?: Array<{ type?: string; data?: unknown }> };
  options?: {
    layout?: { padding?: number | { top?: number; right?: number; bottom?: number; left?: number } };
    scales?: Record<string, unknown>;
  };
  config?: {
    options?: {
      layout?: { padding?: number | { top?: number; right?: number; bottom?: number; left?: number } };
      scales?: Record<string, unknown>;
    };
  };
  update?: (mode?: string) => void;
  resize?: () => void;
}

export interface SyncLinkedChartsResult {
  xMin: number;
  xMax: number;
  rightAxisWidthPx: number;
  plotLeftPx: number;
  plotRightPx: number;
}

export const LINKED_RIGHT_AXIS_MIN_PX = 72;

/** Where `syncTimeScale` reads the main chart's x-range from. */
export type XRangeSource = 'rendered' | 'options';

@Injectable({ providedIn: 'root' })
export class ChartLinkedScaleService {
  private static instance: ChartLinkedScaleService | null = null;
  private static enforcerRegistered = false;

  private cachedRightAxisWidthPx = LINKED_RIGHT_AXIS_MIN_PX;
  private mcbChartRef: LinkedChartRefLike | null = null;
  /** Main chart of the last rendered-layout sync, used to re-align the panel when only it resizes. */
  private mainChartRef: LinkedChartRefLike | null = null;
  private linkedXMin: number | null = null;
  private linkedXMax: number | null = null;
  private mcbUpdateRaf: number | null = null;
  /**
   * The one authoritative time scale of the chart page. Every pane's x-range is
   * projected from it (main chart and MCB panel alike).
   */
  readonly timeScale = new TimeScale();
  /** Main canvas width (CSS px) of its last layout, to predict the plot width on a resize. */
  private mainCanvasWidth = 0;
  /** MCB plot edges relative to the main plot edges (CSS px), from the last DOM alignment. */
  private mcbPlotDelta = { left: 0, right: 0 };
  /** Pan/zoom limits of the main x-range (the interaction service's overscroll range). */
  xRangeLimits?: () => TimeRange | null;

  constructor() {
    ChartLinkedScaleService.instance = this;
    ChartLinkedScaleService.registerEnforcerPlugin();
  }

  get linkedRightAxisWidthPx(): number {
    return this.cachedRightAxisWidthPx;
  }

  registerMcbChart(mcbRef: LinkedChartRefLike | null): void {
    this.mcbChartRef = mcbRef;
  }

  clearMcbChart(): void {
    this.mcbChartRef = null;
    this.mainChartRef = null;
    this.mcbPlotDelta = { left: 0, right: 0 };
  }

  clearLinkedRange(): void {
    this.linkedXMin = null;
    this.linkedXMax = null;
  }

  /** Drop MCB x constraints so a stale range cannot survive timeframe switches. */
  resetMcbXRange(mcbRef?: LinkedChartRefLike | null): void {
    const chartRef = mcbRef ?? this.mcbChartRef;
    if (!chartRef) return;

    const clearX = (x?: { min?: number; max?: number; options?: { min?: number; max?: number } }) => {
      if (!x) return;
      if (x.options) {
        delete x.options.min;
        delete x.options.max;
      }
      delete x.min;
      delete x.max;
    };

    clearX(chartRef.scales?.x as any);

    const optsX = chartRef.options?.scales?.['x'] as { min?: number; max?: number } | undefined;
    if (optsX) {
      delete optsX.min;
      delete optsX.max;
    }

    const cfgX = chartRef.config?.options?.scales?.['x'] as { min?: number; max?: number } | undefined;
    if (cfgX) {
      delete cfgX.min;
      delete cfgX.max;
    }
  }

  /** Called from handlePan / zoomHorizontal with fresh xScale.options.min/max. */
  notifyMainPan(mainRef: LinkedChartRefLike): void {
    if (!this.pushXRangeFromMain(mainRef)) return;
    this.ensureMcbChartRef();
    this.scheduleMcbChartUpdate();
  }

  pushXRangeFromMain(mainRef: LinkedChartRefLike): { xMin: number; xMax: number } | null {
    // Never fall back to rendered scale.min/max — they stay stale after timeframe changes.
    const raw = readXRange(mainRef, 'options');
    if (!raw) return null;
    const range = this.syncTimeScale(mainRef, 'options') ? this.mcbTimeRange() : null;
    const { min: xMin, max: xMax } = range ?? raw;
    this.linkedXMin = xMin;
    this.linkedXMax = xMax;
    return { xMin, xMax };
  }

  /**
   * Bring the shared TimeScale in line with a candlestick chart: its candles,
   * plot edges and x-range (`source`: rendered scale.min/max or the option
   * objects). `candles` overrides the chart's data when it has not received the
   * new dataset yet. False when the chart has no candles or the scale is not ready.
   */
  syncTimeScale(
    chartRef: LinkedChartRefLike | null | undefined,
    source: XRangeSource = 'rendered',
    candles?: ArrayLike<{ x: number }>,
  ): boolean {
    const data = candles ?? candlesOf(chartRef);
    if (!chartRef) return false;
    const ts = this.timeScale;
    if (!data?.length) {
      // No candles (e.g. mid symbol switch): drop the old ones so no stale times survive.
      ts.setCandles([]);
      return false;
    }
    ts.setCandles(data);
    const area = chartRef.chartArea;
    if (area && area.right > area.left) ts.setPlot(area.left, area.right);
    const range = readXRange(chartRef, source);
    if (range) ts.setVisibleTimeRange(range.min, range.max);
    return ts.isReady;
  }

  /**
   * Sync the TimeScale for conversions on `chartRef`: a candlestick chart syncs
   * from itself, the linked MCB panel from the main chart it follows. False
   * when the TimeScale cannot be trusted for this chart.
   */
  syncTimeScaleForPane(chartRef: LinkedChartRefLike | null | undefined): boolean {
    if (!chartRef) return false;
    if (candlesOf(chartRef)) return this.syncTimeScale(chartRef, 'rendered');
    const isMcb = chartRef === this.mcbChartRef || chartRef.canvas?.dataset?.['linkedPanel'] === 'mcb';
    const main = this.mainChartRef;
    return isMcb && !!main && main !== chartRef && this.syncTimeScale(main, 'rendered');
  }

  /**
   * Container resize of the main chart (Chart.js `resize` hook, before its
   * layout): the TimeScale keeps its bar spacing and anchors the right edge at
   * the live edge, else the logical center; the new range goes into the main
   * chart before it lays out. The plot is predicted from the canvas width delta.
   */
  onMainResize(mainRef: LinkedChartRefLike, newWidth: number): void {
    // A different chart instance (route navigation): never compare against the previous chart's width.
    const prevWidth = mainRef === this.mainChartRef ? this.mainCanvasWidth : 0;
    this.mainChartRef = mainRef;
    if (newWidth > 0) this.mainCanvasWidth = newWidth;
    const ts = this.timeScale;
    if (!(prevWidth > 0) || !(newWidth > 0) || newWidth === prevWidth || !(ts.plotWidth > 0)) return;
    const data = candlesOf(mainRef);
    const range = readXRange(mainRef, 'options');
    if (!data?.length || !range) return;
    ts.setCandles(data);
    if (!ts.setVisibleTimeRange(range.min, range.max)) return;
    ts.resize(ts.plotLeft, ts.plotRight + (newWidth - prevWidth));
    this.clampToXLimits();
    ts.applyToChart(mainRef);
  }

  /** Keep the TimeScale range inside the pan/zoom limits (overscroll range), like a pan would. */
  private clampToXLimits(): void {
    const limits = this.xRangeLimits?.();
    const range = this.timeScale.visibleTimeRange();
    if (!range || !limits || !Number.isFinite(limits.min) || !Number.isFinite(limits.max)) return;
    if (!(limits.max > limits.min)) return;
    const width = range.max - range.min;
    let { min, max } = range;
    if (width > limits.max - limits.min) {
      min = limits.min;
      max = limits.max;
    } else if (min < limits.min) {
      min = limits.min;
      max = min + width;
    } else if (max > limits.max) {
      max = limits.max;
      min = max - width;
    }
    if (min !== range.min || max !== range.max) this.timeScale.setVisibleTimeRange(min, max);
  }

  /** MCB x-range from the TimeScale, for the MCB plot edges of the last alignment. */
  private mcbTimeRange(): TimeRange | null {
    const ts = this.timeScale;
    return ts.timeRangeForPlot({
      left: ts.plotLeft + this.mcbPlotDelta.left,
      right: ts.plotRight + this.mcbPlotDelta.right,
    });
  }

  applyLinkedRangeToMcb(): boolean {
    this.ensureMcbChartRef();

    if (
      this.mcbChartRef == null ||
      this.linkedXMin == null ||
      this.linkedXMax == null ||
      !Number.isFinite(this.linkedXMin) ||
      !Number.isFinite(this.linkedXMax)
    ) {
      return false;
    }

    this.applyXRangeToChart(this.mcbChartRef, this.linkedXMin, this.linkedXMax);
    this.scheduleMcbChartUpdate();
    return true;
  }

  /** Debounced MCB update — avoids ng2-charts fighting mid-pan option rebinds. */
  private scheduleMcbChartUpdate(): void {
    if (this.mcbUpdateRaf != null) return;

    this.mcbUpdateRaf = requestAnimationFrame(() => {
      this.mcbUpdateRaf = null;
      this.ensureMcbChartRef();

      if (
        this.mcbChartRef == null ||
        this.linkedXMin == null ||
        this.linkedXMax == null
      ) {
        return;
      }

      this.applyXRangeToChart(this.mcbChartRef, this.linkedXMin, this.linkedXMax);

      try {
        this.mcbChartRef.update?.('none');
      } catch {}
    });
  }

  /** Resolve MCB chart from DOM when ViewChild / registry is stale. */
  ensureMcbChartRef(): LinkedChartRefLike | null {
    if (this.mcbChartRef?.scales?.x) return this.mcbChartRef;

    if (typeof document === 'undefined') return null;

    const canvas = document.querySelector(
      '.mcb-plot canvas[data-linked-panel="mcb"]',
    ) as HTMLCanvasElement | null;

    return this.resolveMcbChartFromCanvas(canvas);
  }

  syncMcbFromMain(mainRef: LinkedChartRefLike, mcbRef?: LinkedChartRefLike | null): boolean {
    if (!this.pushXRangeFromMain(mainRef)) return false;
    if (mcbRef) this.registerMcbChart(mcbRef);
    return this.applyLinkedRangeToMcb();
  }

  /** Resolve MCB Chart.js instance from canvas element (works when ViewChild is stale). */
  resolveMcbChartFromCanvas(canvas: HTMLCanvasElement | null | undefined): LinkedChartRefLike | null {
    if (!canvas) return null;
    try {
      const chart = Chart.getChart(canvas) as LinkedChartRefLike | undefined;
      if (chart?.scales?.x) {
        this.registerMcbChart(chart);
        return chart;
      }
    } catch {}
    return null;
  }

  /**
   * Pixel-exact alignment from the DOM: MCB plot left = main plot left, and the
   * gutter spans from the main plot's right edge to the panel's right edge.
   * Handles panel borders and container padding; null when not measurable.
   */
  private alignToMainPlotFromDom(
    source: LinkedChartRefLike,
    target: LinkedChartRefLike,
  ): { plotLeftPx: number; plotRightPx: number; gutterPx: number; changed: boolean } | null {
    const area = source.chartArea;
    const mainCanvas = source.canvas;
    const mcbCanvas = target.canvas;
    const body = mcbCanvas?.closest?.('.mcb-panel__body');
    if (!area || !mainCanvas || !mcbCanvas || !body) return null;
    const mainRect = mainCanvas.getBoundingClientRect();
    const mcbRect = mcbCanvas.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    if (!mainRect.width || !mcbRect.width || !bodyRect.width) return null;

    const plotLeft = mainRect.left + area.left;
    const plotRight = mainRect.left + area.right;
    const leftPad = Math.max(0, Math.round(plotLeft - mcbRect.left));
    // Until the gutter width catches up, pad the right so the plot still ends where the main one does.
    const rightPad = Math.max(0, Math.round(mcbRect.right - plotRight));
    const gutterPx = Math.max(0, Math.round(bodyRect.right - plotRight));
    const current = target.options?.layout?.padding;
    const changed =
      typeof current !== 'object' || current?.left !== leftPad || current?.right !== rightPad;
    if (changed) this.setLayoutPadding(target, { left: leftPad, right: rightPad });
    this.cachedRightAxisWidthPx = gutterPx;
    // Where the MCB plot edges end up (its chartArea spans the layout padding;
    // the y-axis is hidden), relative to the main plot: the rounding residue of
    // the padding goes into the MCB x-range instead of misaligning timestamps.
    this.mcbPlotDelta = { left: mcbRect.left + leftPad - plotLeft, right: mcbRect.right - rightPad - plotRight };
    return { plotLeftPx: leftPad, plotRightPx: Math.round(plotRight - mcbRect.left), gutterPx, changed };
  }

  /**
   * After every main-chart update, re-align the MCB panel from the main chart's
   * rendered layout: the time at its plot edges (read through its own pixel
   * mapping, so axis offsets match exactly) and its plot's pixel edges. The
   * pre-layout estimate used while panning is corrected here each frame.
   */
  private static registerEnforcerPlugin(): void {
    if (ChartLinkedScaleService.enforcerRegistered) return;
    ChartLinkedScaleService.enforcerRegistered = true;
    try {
      Chart.register({
        id: 'linkedPanelSync',
        afterUpdate: (chart: Chart) => {
          if (chart.canvas?.dataset?.['linkedPanel'] !== 'main') return;
          ChartLinkedScaleService.instance?.syncMcbFromRenderedMain(chart as unknown as LinkedChartRefLike);
        },
        // Main chart: the TimeScale decides the range for the new width before
        // the resize layout. The panel's canvas changes size on its own (e.g. when
        // the axis gutter width catches up); re-measure the padding before its
        // resize update.
        resize: (chart: Chart, args: { size?: { width?: number } }) => {
          const panel = chart.canvas?.dataset?.['linkedPanel'];
          const ref = chart as unknown as LinkedChartRefLike;
          if (panel === 'main') ChartLinkedScaleService.instance?.onMainResize(ref, Number(args?.size?.width));
          else if (panel === 'mcb') ChartLinkedScaleService.instance?.realignMcbPlot(ref);
        },
      });
    } catch {}
  }

  /** Plot padding + x-range of the MCB chart from the main chart's last layout (no update; the caller's update applies it). */
  realignMcbPlot(mcbRef: LinkedChartRefLike): void {
    const main = this.mainChartRef;
    if (!main?.canvas?.isConnected) return;
    this.alignToMainPlotFromDom(main, mcbRef);
    const range = this.mcbTimeRange();
    if (!range) return;
    this.linkedXMin = range.min;
    this.linkedXMax = range.max;
    this.applyXRangeToChart(mcbRef, range.min, range.max);
  }

  /**
   * After every main-chart update: sync the TimeScale with the rendered main
   * chart, align the MCB plot edges to the main plot (DOM) and give the MCB the
   * TimeScale's range for those edges.
   */
  syncMcbFromRenderedMain(mainRef: LinkedChartRefLike): boolean {
    if (mainRef !== this.mainChartRef) this.mainCanvasWidth = 0;
    this.mainChartRef = mainRef;
    if (typeof mainRef.width === 'number' && mainRef.width > 0) this.mainCanvasWidth = mainRef.width;
    const synced = this.syncTimeScale(mainRef, 'rendered');
    const mcb = this.mcbChartRef;
    if (!synced || !mcb?.scales?.x || !mcb.canvas?.isConnected || !mainRef.chartArea) return false;
    const padding = this.alignToMainPlotFromDom(mainRef, mcb);
    const range = this.mcbTimeRange();
    if (!range) return false;
    const { min: xMin, max: xMax } = range;
    const mcbX = mcb.scales.x;
    const same =
      this.linkedXMin === xMin &&
      this.linkedXMax === xMax &&
      mcbX.options?.min === xMin &&
      mcbX.options?.max === xMax &&
      !padding?.changed;
    this.linkedXMin = xMin;
    this.linkedXMax = xMax;
    if (same) return true;
    this.applyXRangeToChart(mcb, xMin, xMax);
    try {
      mcb.update?.('none');
    } catch {}
    return true;
  }

  /** Total right gutter: layout padding + y-axis column (matches yellow-block width). */
  measureRightGutterPx(chartRef: LinkedChartRefLike): number {
    const area = chartRef.chartArea;
    const width = chartRef.width;
    if (area && typeof width === 'number' && width > 0) {
      const gutter = Math.max(LINKED_RIGHT_AXIS_MIN_PX, Math.ceil(width - area.right));
      this.cachedRightAxisWidthPx = gutter;
      return gutter;
    }

    const yWidth = chartRef.scales?.y?.width;
    if (typeof yWidth === 'number' && yWidth > 0) {
      this.cachedRightAxisWidthPx = Math.max(LINKED_RIGHT_AXIS_MIN_PX, Math.ceil(yWidth));
    }
    return this.cachedRightAxisWidthPx;
  }

  measureRightAxisWidth(chartRef: LinkedChartRefLike): number {
    return this.measureRightGutterPx(chartRef);
  }

  syncTimeRange(
    source: LinkedChartRefLike,
    target: LinkedChartRefLike,
  ): { xMin: number; xMax: number } | null {
    const range = this.pushXRangeFromMain(source);
    if (!range) return null;

    this.applyXRangeToChart(target, range.xMin, range.xMax);

    return range;
  }

  /** Write x min/max on existing option objects — never spread Chart.js scale configs. */
  applyXRangeToChart(chartRef: LinkedChartRefLike, xMin: number, xMax: number): void {
    writeXRange(chartRef, { min: xMin, max: xMax });
  }

  /** Align MCB canvas padding to match main plot edges. Does not modify the main chart. */
  alignMcbPlotPadding(
    source: LinkedChartRefLike,
    target: LinkedChartRefLike,
  ): { plotLeftPx: number; plotRightPx: number } | null {
    const sourceArea = source.chartArea;
    const sourceWidth = source.width;
    const targetWidth = target.width;
    if (!sourceArea || !sourceWidth || !targetWidth) return null;

    const leftPad =
      sourceWidth > 0
        ? Math.max(0, Math.round((sourceArea.left / sourceWidth) * targetWidth))
        : Math.max(0, Math.round(sourceArea.left));
    this.setLayoutPadding(target, { left: leftPad, right: 0 });

    const plotRightPx =
      sourceWidth > 0
        ? Math.round((sourceArea.right / sourceWidth) * targetWidth)
        : Math.round(sourceArea.right);

    return {
      plotLeftPx: leftPad,
      plotRightPx,
    };
  }

  syncLinkedCharts(
    source: LinkedChartRefLike,
    target: LinkedChartRefLike,
  ): SyncLinkedChartsResult | null {
    this.registerMcbChart(target);
    this.mainChartRef = source;

    // Plot edges first: the x-range is the TimeScale's range for them.
    const dom = this.alignToMainPlotFromDom(source, target);
    const range = this.syncTimeRange(source, target);
    if (!range) return null;

    const rightGutterPx = dom?.gutterPx ?? this.measureRightGutterPx(source);
    const plot = dom ?? this.alignMcbPlotPadding(source, target);
    if (!plot) return null;

    try {
      target.resize?.();
      target.update?.('none');
    } catch {}

    return { ...range, rightAxisWidthPx: rightGutterPx, plotLeftPx: plot.plotLeftPx, plotRightPx: plot.plotRightPx };
  }

  private setLayoutPadding(
    chartRef: LinkedChartRefLike,
    patch: { left?: number; right?: number; bottom?: number; top?: number },
  ): void {
    const patchPadding = (
      current: number | { top?: number; right?: number; bottom?: number; left?: number } | undefined,
    ) => {
      if (typeof current === 'number') {
        return {
          top: patch.top ?? current,
          right: patch.right ?? current,
          bottom: patch.bottom ?? current,
          left: patch.left ?? current,
        };
      }

      const base = current ?? {};
      return {
        top: patch.top ?? base.top ?? 0,
        right: patch.right ?? base.right ?? 0,
        bottom: patch.bottom ?? base.bottom ?? 0,
        left: patch.left ?? base.left ?? 0,
      };
    };

    if (!chartRef.options) chartRef.options = {};
    if (!chartRef.options.layout) chartRef.options.layout = {};
    chartRef.options.layout.padding = patchPadding(chartRef.options.layout.padding);

    if (!chartRef.config) chartRef.config = { options: {} };
    if (!chartRef.config.options) chartRef.config.options = {};
    if (!chartRef.config.options.layout) chartRef.config.options.layout = {};
    chartRef.config.options.layout.padding = patchPadding(
      chartRef.config.options.layout.padding,
    );
  }
}

/** Data of the candlestick dataset, null for other charts. */
function candlesOf(chartRef: LinkedChartRefLike | null | undefined): Array<{ x: number }> | null {
  const ds = chartRef?.data?.datasets?.find((d) => d?.type === 'candlestick');
  return Array.isArray(ds?.data) ? (ds.data as Array<{ x: number }>) : null;
}

/** The chart's x-range: 'rendered' = scale.min/max (option objects as fallback), 'options' = option objects only. */
function readXRange(chartRef: LinkedChartRefLike | null | undefined, source: XRangeSource): TimeRange | null {
  const x = chartRef?.scales?.x;
  const cfgX = chartRef?.config?.options?.scales?.['x'] as { min?: number; max?: number } | undefined;
  const pick = (...values: Array<number | undefined>) =>
    values.find((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const min = source === 'rendered' ? pick(x?.min, x?.options?.min, cfgX?.min) : pick(x?.options?.min, cfgX?.min);
  const max = source === 'rendered' ? pick(x?.max, x?.options?.max, cfgX?.max) : pick(x?.options?.max, cfgX?.max);
  return min !== undefined && max !== undefined && max > min ? { min, max } : null;
}
