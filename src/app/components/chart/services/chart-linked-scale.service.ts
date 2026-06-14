import { Injectable } from '@angular/core';
import { Chart } from 'chart.js';

export interface LinkedChartRefLike {
  width?: number;
  chartArea?: { left: number; right: number; top: number; bottom: number };
  scales?: {
    x?: {
      min?: number;
      max?: number;
      options?: { min?: number; max?: number };
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
  private linkedXMin: number | null = null;
  private linkedXMax: number | null = null;
  private mcbUpdateRaf: number | null = null;

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

  private static registerEnforcerPlugin(): void {
    if (ChartLinkedScaleService.enforcerRegistered) return;
    ChartLinkedScaleService.enforcerRegistered = true;
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

    const range = this.syncTimeRange(source, target);
    if (!range) return null;

    const rightGutterPx = this.measureRightGutterPx(source);
    const plot = this.alignMcbPlotPadding(source, target);
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
