import { Injectable } from '@angular/core';
import { Chart } from 'chart.js';

export interface LinkedChartRefLike {
  width?: number;
  canvas?: HTMLCanvasElement | null;
  chartArea?: { left: number; right: number; top: number; bottom: number };
  scales?: {
    x?: {
      min?: number;
      max?: number;
      options?: { min?: number; max?: number; offset?: boolean };
      getDataTimestamps?: () => number[];
      getPixelForValue?: (value: number) => number;
      /** Chart.js internal: edge padding (fractions of the range) from the last layout. */
      _offsets?: { start: number; end: number };
    };
    y?: {
      width?: number;
      options?: Record<string, unknown>;
      afterFit?: (scale: { width: number }) => void;
    };
  };
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
  /** Exact x-range read from the main chart's last layout, keyed by the option range it was laid out with. */
  private renderedRange: { optMin: number; optMax: number; xMin: number; xMax: number } | null = null;

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
  }

  clearLinkedRange(): void {
    this.linkedXMin = null;
    this.linkedXMax = null;
    this.renderedRange = null;
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
    const xScale = mainRef.scales?.x;
    if (!xScale) return null;

    const cfgX = mainRef.config?.options?.scales?.['x'] as
      | { min?: number; max?: number }
      | undefined;

    let xMin =
      typeof xScale.options?.min === 'number'
        ? xScale.options.min
        : undefined;
    let xMax =
      typeof xScale.options?.max === 'number'
        ? xScale.options.max
        : undefined;

    if (typeof xMin !== 'number' && typeof cfgX?.min === 'number') xMin = cfgX.min;
    if (typeof xMax !== 'number' && typeof cfgX?.max === 'number') xMax = cfgX.max;

    // Never fall back to rendered scale.min/max — they stay stale after timeframe changes.
    if (typeof xMin !== 'number' || typeof xMax !== 'number' || !Number.isFinite(xMin) || !Number.isFinite(xMax)) {
      return null;
    }

    const rendered = this.renderedRange;
    if (rendered && rendered.optMin === xMin && rendered.optMax === xMax) {
      ({ xMin, xMax } = rendered);
    } else {
      ({ xMin, xMax } = this.withMainOffsets(mainRef, xMin, xMax));
    }
    this.linkedXMin = xMin;
    this.linkedXMax = xMax;
    return { xMin, xMax };
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
   * The candlestick x-scale has `offset: true` (half a candle of padding at each
   * edge). Widen min/max by the same padding so a non-offset target scale maps
   * every timestamp to the same pixel. Mirrors Chart.js TimeScale.initOffsets.
   */
  private withMainOffsets(
    mainRef: LinkedChartRefLike,
    xMin: number,
    xMax: number,
  ): { xMin: number; xMax: number } {
    const x = mainRef.scales?.x;
    const range = xMax - xMin;
    if (!x?.options?.offset || !(range > 0)) {
      return { xMin, xMax };
    }
    // Prefer the offsets Chart.js actually laid out with. With `ticks.source:
    // 'auto'` it derives them from generated ticks, not from the data, so the
    // data-gap estimate below can differ and squeeze the panel's time axis.
    const o = x._offsets;
    if (o && Number.isFinite(o.start) && Number.isFinite(o.end)) {
      return { xMin: xMin - o.start * range, xMax: xMax + o.end * range };
    }
    if (typeof x.getDataTimestamps !== 'function') return { xMin, xMax };
    let timestamps: number[] = [];
    try {
      timestamps = x.getDataTimestamps() ?? [];
    } catch {}
    const n = timestamps.length;
    if (n < 2) return { xMin, xMax };
    const limit = n < 3 ? 0.5 : 0.25;
    const clamp = (v: number) => Math.min(limit, Math.max(0, v));
    const start = clamp((timestamps[1] - timestamps[0]) / range / 2);
    const end = clamp((timestamps[n - 1] - timestamps[n - 2]) / range / 2);
    return { xMin: xMin - start * range, xMax: xMax + end * range };
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
        // The panel's canvas changes size on its own (e.g. when the axis gutter
        // width catches up); re-measure the padding before its resize update.
        resize: (chart: Chart) => {
          if (chart.canvas?.dataset?.['linkedPanel'] !== 'mcb') return;
          ChartLinkedScaleService.instance?.realignMcbPlot(chart as unknown as LinkedChartRefLike);
        },
      });
    } catch {}
  }

  /** Plot padding of the MCB chart from the main chart's last layout (no update; the caller's update applies it). */
  realignMcbPlot(mcbRef: LinkedChartRefLike): void {
    const main = this.mainChartRef;
    if (!main?.canvas?.isConnected) return;
    this.alignToMainPlotFromDom(main, mcbRef);
  }

  /** Exact MCB x-range + plot edges from the main chart's current layout. */
  syncMcbFromRenderedMain(mainRef: LinkedChartRefLike): boolean {
    this.mainChartRef = mainRef;
    const mcb = this.mcbChartRef;
    const x = mainRef.scales?.x;
    const area = mainRef.chartArea;
    if (!mcb?.scales?.x || !mcb.canvas?.isConnected || !x?.getPixelForValue || !area) return false;
    const t1 = x.min;
    const t2 = x.max;
    if (typeof t1 !== 'number' || typeof t2 !== 'number' || !(t2 > t1)) return false;
    const p1 = x.getPixelForValue(t1);
    const p2 = x.getPixelForValue(t2);
    if (!Number.isFinite(p1) || !Number.isFinite(p2) || !(p2 > p1)) return false;
    const msPerPx = (t2 - t1) / (p2 - p1);
    const xMin = t1 + (area.left - p1) * msPerPx;
    const xMax = t1 + (area.right - p1) * msPerPx;

    const optMin = x.options?.min;
    const optMax = x.options?.max;
    if (typeof optMin === 'number' && typeof optMax === 'number') {
      this.renderedRange = { optMin, optMax, xMin, xMax };
    }
    const padding = this.alignToMainPlotFromDom(mainRef, mcb);
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
    const targetX = chartRef.scales?.x;
    if (targetX) {
      targetX.options = targetX.options ?? {};
      targetX.options.min = xMin;
      targetX.options.max = xMax;
    }

    const optsX = chartRef.options?.scales?.['x'] as { min?: number; max?: number } | undefined;
    if (optsX && typeof optsX === 'object') {
      optsX.min = xMin;
      optsX.max = xMax;
    }

    const cfgX = chartRef.config?.options?.scales?.['x'] as { min?: number; max?: number } | undefined;
    if (cfgX && typeof cfgX === 'object') {
      cfgX.min = xMin;
      cfgX.max = xMax;
    }
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

    const range = this.syncTimeRange(source, target);
    if (!range) return null;

    const dom = this.alignToMainPlotFromDom(source, target);
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
