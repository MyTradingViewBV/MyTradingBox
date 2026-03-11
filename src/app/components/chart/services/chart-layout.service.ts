import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  calculateNiceStep,
  generateNumericTicks,
  filterTicksByPixelSpacing,
  detectMobileTickTargets,
  calculateBarsPerLabel,
  filterTicksByPixelGap,
  buildChartViewport,
  ChartViewport,
} from '../utils/chart-utils';

/**
 * ChartLayoutService
 * Centralizes layout state for the chart (e.g. compact fullscreen-like mode)
 * AND adaptive axis tick density for mobile/desktop.
 * 
 * Footer toggles compact mode; chart component consumes observable/state.
 * Chart interaction service calls updateAdaptiveYAxisTicks() to refresh tick density.
 * 
 * Usage:
 *   - Inject in footer: call toggleCompact() to switch modes.
 *   - Inject in chart: read compactMode (getter) or subscribe to compactMode$ for reactive logic.
 *   - Inject in interaction service: call updateAdaptiveYAxisTicks() after pan/zoom to refresh ticks.
 * 
 * Side-effects:
 *   - Chart component hides selects & settings icon when compactMode is true.
 *   - Updates chart.config.options.scales.y.ticks.stepSize for adaptive density.
 */
@Injectable({ providedIn: 'root' })
export class ChartLayoutService {
  /** Observable for template bindings (if needed). */
  readonly compactMode$ = new BehaviorSubject<boolean>(false);

  /** Controls visibility of footer-related controls (button, toolbars, footer). */
  readonly footerControlsVisible$ = new BehaviorSubject<boolean>(true);

  // Cache for adaptive tick calculations - avoid recompute if view hasn't changed
  private cachedYTicksState: {
    visibleMinPrice: number;
    visibleMaxPrice: number;
    chartHeight: number;
    chartWidth: number;
    stepSize: number;
    maxTicksLimit: number;
  } | null = null;

  private cachedXTicksState: {
    visibleMinTime: number;
    visibleMaxTime: number;
    chartWidth: number;
    chartHeight: number;
    stepSize: number;
    maxTicksLimit: number;
  } | null = null;

  // Cache for X-axis label interval calculations
  private cachedXLabelInterval: {
    visibleBars: number;
    chartWidth: number;
    isMobile: boolean;
    barsPerLabel: number;
  } | null = null;

  /** Current value accessor */
  get compactMode(): boolean { return this.compactMode$.value; }
  get footerControlsVisible(): boolean { return this.footerControlsVisible$.value; }

  /** Toggle compact mode */
  toggleCompact(): void { this.setCompact(!this.compactMode); }

  /** Explicit setter */
  setCompact(on: boolean): void {
    this.compactMode$.next(on);
  }

  /** Show/hide footer controls across the app (footer button, chart toolbars/footer). */
  setFooterControlsVisible(visible: boolean): void {
    this.footerControlsVisible$.next(visible);
  }

  /**
   * Calculate and apply adaptive Y-axis (price) tick density.
   * Called after pan/zoom to refresh labels based on new visible range and chart size.
   * 
   * SAFE: reads viewport state only, does NOT modify axes or zoom/pan.
   * Returns stepSize to be applied to chartRef.config.options.scales.y.ticks.stepSize
   */
  calculateAdaptiveYAxisStep(
    visibleMinPrice: number,
    visibleMaxPrice: number,
    chartHeight: number,
    chartWidth: number,
  ): { stepSize: number; maxTicksLimit: number } {
    // Validate inputs
    if (
      !isFinite(visibleMinPrice) ||
      !isFinite(visibleMaxPrice) ||
      chartHeight <= 0 ||
      chartWidth <= 0
    ) {
      return { stepSize: 0.01, maxTicksLimit: 14 };
    }

    const range = visibleMaxPrice - visibleMinPrice;
    if (range <= 0) {
      return { stepSize: 0.01, maxTicksLimit: 14 };
    }

    // Check cache - avoid recompute if view unchanged
    if (this.cachedYTicksState) {
      const cached = this.cachedYTicksState;
      if (
        cached.visibleMinPrice === visibleMinPrice &&
        cached.visibleMaxPrice === visibleMaxPrice &&
        cached.chartHeight === chartHeight &&
        cached.chartWidth === chartWidth
      ) {
        return {
          stepSize: cached.stepSize,
          maxTicksLimit: cached.maxTicksLimit,
        };
      }
    }

    // Determine target tick count based on screen size
    const { yAxisTargetTicks } = detectMobileTickTargets(chartWidth, chartHeight);

    // Calculate nice step using the standard algorithm
    const stepSize = calculateNiceStep(range, yAxisTargetTicks);

    // Generate candidate ticks (all ticks at this step size)
    const candidateTicks = generateNumericTicks(
      visibleMinPrice,
      visibleMaxPrice,
      stepSize,
    );

    // Determine maxTicksLimit based on actual tick count
    // This allows Chart.js to auto-skip ticks if they overlap
    const maxTicksLimit = Math.max(4, candidateTicks.length);

    // Cache the result
    this.cachedYTicksState = {
      visibleMinPrice,
      visibleMaxPrice,
      chartHeight,
      chartWidth,
      stepSize,
      maxTicksLimit,
    };

    return { stepSize, maxTicksLimit };
  }

  /**
   * Calculate and apply adaptive X-axis (time) tick density.
   * Similar to Y-axis but for time values.
   * 
   * SAFE: reads viewport state only, does NOT modify axes or zoom/pan.
   * Returns configuration to be applied to chartRef.config.options.scales.x.ticks
   */
  calculateAdaptiveXAxisStep(
    visibleMinTime: number,
    visibleMaxTime: number,
    chartWidth: number,
    chartHeight: number,
  ): { stepSize: number; maxTicksLimit: number } {
    // Validate inputs
    if (
      !isFinite(visibleMinTime) ||
      !isFinite(visibleMaxTime) ||
      chartWidth <= 0 ||
      chartHeight <= 0
    ) {
      return { stepSize: 1, maxTicksLimit: 6 };
    }

    const range = visibleMaxTime - visibleMinTime;
    if (range <= 0) {
      return { stepSize: 1, maxTicksLimit: 6 };
    }

    // Check cache - avoid recompute if view unchanged
    if (this.cachedXTicksState) {
      const cached = this.cachedXTicksState;
      if (
        cached.visibleMinTime === visibleMinTime &&
        cached.visibleMaxTime === visibleMaxTime &&
        cached.chartWidth === chartWidth &&
        cached.chartHeight === chartHeight
      ) {
        return {
          stepSize: cached.stepSize,
          maxTicksLimit: cached.maxTicksLimit,
        };
      }
    }

    // Determine target tick count based on screen size
    const { xAxisTargetTicks } = detectMobileTickTargets(chartWidth, chartHeight);

    // Calculate nice step using the standard algorithm
    const stepSize = calculateNiceStep(range, xAxisTargetTicks);

    // Generate candidate ticks
    const candidateTicks = generateNumericTicks(
      visibleMinTime,
      visibleMaxTime,
      stepSize,
    );

    // Determine maxTicksLimit based on actual tick count
    const maxTicksLimit = Math.max(3, candidateTicks.length);

    // Cache the result
    this.cachedXTicksState = {
      visibleMinTime,
      visibleMaxTime,
      chartWidth,
      chartHeight,
      stepSize,
      maxTicksLimit,
    };

    return { stepSize, maxTicksLimit };
  }

  /**
   * Invalidate caches when chart is resized or manually updated.
   * Forces recalculation on next call.
   */
  invalidateTickCache(): void {
    this.cachedYTicksState = null;
    this.cachedXTicksState = null;
    this.cachedXLabelInterval = null;
  }

  /**
   * Calculate adaptive X-axis time label density based on visible candle count and chart width.
   * Returns how many bars to skip between time labels (bars per label).
   * HIGH DENSITY MODE: 2–3× more labels than baseline (35–45px per label).
   * 
   * SAFE: reads viewport state only, does NOT modify axes or pan/zoom.
   * Does NOT derive from total dataset - uses current visible bar count only.
   * Caches result to avoid recomputation if parameters unchanged.
   * 
   * Example:
   * - visibleBars=200, width=800px, mobile=false → 18 target labels → show every 11th bar
   * - visibleBars=200, width=400px, mobile=true → 11 target labels → show every 18th bar
   * - visibleBars=50, width=800px → 18 target labels → show every 3rd bar
   */
  calculateAdaptiveXAxisLabelInterval(
    visibleBars: number,
    chartWidth: number,
    isMobile: boolean,
  ): number {
    if (visibleBars <= 0 || chartWidth <= 0) return 1;

    // Check cache
    if (this.cachedXLabelInterval) {
      const cached = this.cachedXLabelInterval;
      if (
        cached.visibleBars === visibleBars &&
        cached.chartWidth === chartWidth &&
        cached.isMobile === isMobile
      ) {
        return cached.barsPerLabel;
      }
    }

    // Calculate
    const barsPerLabel = calculateBarsPerLabel(visibleBars, chartWidth, isMobile);

    // Cache
    this.cachedXLabelInterval = {
      visibleBars,
      chartWidth,
      isMobile,
      barsPerLabel,
    };

    return barsPerLabel;
  }

  /**
   * Determine which visible candle indices should display time labels.
   * Used to filter X-axis ticks for adaptive density.
   * 
   * SAFE: pure function, no side effects.
   * Returns array of indices where labels should appear.
   * 
   * Example:
   * - startIdx=0, endIdx=99, barsPerLabel=10 → [0, 10, 20, 30, ..., 90]
   */
  getActiveLabelIndices(
    startIdx: number,
    endIdx: number,
    barsPerLabel: number,
  ): number[] {
    if (barsPerLabel <= 0 || startIdx < 0 || endIdx < startIdx) return [];
    
    const indices: number[] = [];
    for (let i = startIdx; i <= endIdx; i += barsPerLabel) {
      indices.push(i);
    }
    return indices;
  }

  /**
   * Filter X-axis time labels to prevent visual overlap.
   * Maps tick indices to pixel x-positions, then keeps only ticks separated by minPixelGap.
   * Minimum gap is 25px by default (prevents label text overlap).
   * 
   * SAFE: pure function, uses provided pixel mapper to determine x-positions.
   * 
   * Example:
   * Input: indices=[0, 10, 20, 30], indexToPixel=identity
   * minPixelGap=25
   * If pixels are [10, 30, 50, 70]: returns [0, 20, 30] (index 10@30px is removed)
   */
  filterLabelsByPixelCollision(
    indices: number[],
    indexToPixel: (index: number) => number,
    minPixelGap: number = 25,
  ): number[] {
    if (!indices || indices.length === 0) return [];

    const ticksWithX = indices
      .map((idx) => ({ index: idx, x: indexToPixel(idx) }))
      .filter((t) => isFinite(t.x));

    const filtered = filterTicksByPixelGap(ticksWithX, minPixelGap);
    return filtered.map((t) => t.index);
  }

  /**
   * Build a ChartViewport from current chart state.
   * Calculates visible candle indices and provides pixel/data transforms.
   * Used by indicators, overlays, and custom rendering to access consistent coordinates.
   * 
   * SAFE: read-only operation, does NOT modify chart or scales.
   * Pure computation from provided scale bounds and data.
   * 
   * @param chartRef - Chart.js chart instance
   * @param candleData - Full array of candle data
   * @returns ChartViewport object for use with coordinate transforms (indexToX, priceToY)
   */
  buildViewport(chartRef: any, candleData: Array<{ x: number }>): ChartViewport {
    if (!chartRef || !candleData || candleData.length === 0) {
      return {
        visibleStartIndex: 0,
        visibleEndIndex: 0,
        minPrice: 0,
        maxPrice: 1,
        width: 800,
        height: 400,
      };
    }

    try {
      const xScale = chartRef.scales?.x;
      const yScale = chartRef.scales?.y;
      const chartArea = chartRef.chartArea;

      if (!xScale || !yScale || !chartArea) return this.getDefaultViewport(chartRef);

      const xMin = xScale.min ?? xScale.options?.min ?? 0;
      const xMax = xScale.max ?? xScale.options?.max ?? 1;
      const yMin = yScale.min ?? yScale.options?.min ?? 0;
      const yMax = yScale.max ?? yScale.options?.max ?? 1;

      const chartWidth = chartArea.right - chartArea.left;
      const chartHeight = chartArea.bottom - chartArea.top;

      return buildChartViewport(candleData, xMin, xMax, yMin, yMax, chartWidth, chartHeight);
    } catch {
      return this.getDefaultViewport(chartRef);
    }
  }

  /**
   * Get a safe fallback viewport if scales/data are unavailable.
   * Used when buildViewport() cannot compute a valid viewport.
   */
  private getDefaultViewport(chartRef: any): ChartViewport {
    try {
      const chartArea = chartRef?.chartArea;
      const width = chartArea ? chartArea.right - chartArea.left : 800;
      const height = chartArea ? chartArea.bottom - chartArea.top : 400;
      return {
        visibleStartIndex: 0,
        visibleEndIndex: 0,
        minPrice: 0,
        maxPrice: 1,
        width,
        height,
      };
    } catch {
      return {
        visibleStartIndex: 0,
        visibleEndIndex: 0,
        minPrice: 0,
        maxPrice: 1,
        width: 800,
        height: 400,
      };
    }
  }
}