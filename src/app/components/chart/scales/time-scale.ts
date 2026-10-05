/**
 * Authoritative horizontal (time) scale shared by every pane of a chart page.
 *
 * State: bar spacing (px per candle), right offset (empty bars right of the
 * last candle), the candle timestamps and the plot edges (CSS px). Everything
 * else is derived from that state by pure functions, so repeated zoom/pan can
 * never accumulate alignment error between panes.
 *
 * Logical indices are fractional: candle i sits at logical i, halfway to the
 * next candle is i + 0.5, and beyond either end of the data the average candle
 * gap extrapolates further slots.
 *
 *   rightLogical     = lastDataIndex + rightOffsetBars
 *   x(logical)       = plotRight - (rightLogical - logical) * barSpacingPx
 *   logical(x)       = rightLogical - (plotRight - x) / barSpacingPx
 *
 * Chart.js stays the renderer: `applyToChart` projects the visible range to
 * `scales.x.min/max` (ms). Its time axes are linear in time, so a pane only
 * needs the times at its plot edges to line up with every other pane.
 */

/** Narrowest bar spacing (px per candle). */
export const MIN_BAR_SPACING = 0.5;
/** Widest bar spacing (px per candle). */
export const MAX_BAR_SPACING = 64;
/** Bar spacing of the default view (px per candle), like TradingView's initial zoom. */
export const DEFAULT_BAR_SPACING = 12;
/** Candles averaged by `averageCandleGap`. */
export const CANDLE_GAP_LOOKBACK = 50;

export interface TimeRange {
  min: number;
  max: number;
}

export interface LogicalRange {
  from: number;
  to: number;
}

/** Plot edges of a pane, in the TimeScale's x frame (CSS px). */
export interface PanePlot {
  left: number;
  right: number;
}

export interface TimeScaleCandle {
  x: number;
}

/** Minimal Chart.js chart shape `applyToChart` writes to. */
export interface TimeScaleChartLike {
  scales?: {
    x?: { min?: number; max?: number; options?: { min?: number; max?: number } };
  };
  options?: { scales?: Record<string, unknown> };
  config?: { options?: { scales?: Record<string, unknown> } };
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A usable bar spacing: finite and > 0, else `fallback`. No min/max clamp. */
export function sanitizeBarSpacing(px: number, fallback = DEFAULT_BAR_SPACING): number {
  return isFiniteNumber(px) && px > 0 ? px : fallback;
}

/** Bar spacing clamped to [MIN_BAR_SPACING, MAX_BAR_SPACING]; NaN/Infinity/<= 0 give `fallback`. */
export function clampBarSpacing(px: number, fallback = DEFAULT_BAR_SPACING): number {
  if (px === Number.POSITIVE_INFINITY) return MAX_BAR_SPACING;
  const safe = sanitizeBarSpacing(px, fallback);
  return Math.min(MAX_BAR_SPACING, Math.max(MIN_BAR_SPACING, safe));
}

/** Average x distance between the last ~50 candles, 0 when unknown. */
export function averageCandleGap(
  candles: ArrayLike<TimeScaleCandle>,
  lookback = CANDLE_GAP_LOOKBACK,
): number {
  const n = candles?.length ?? 0;
  if (n < 2) return 0;
  const span = Math.min(n - 1, lookback);
  const gap = (candles[n - 1].x - candles[n - 1 - span].x) / span;
  return Number.isFinite(gap) && gap > 0 ? gap : 0;
}

export class TimeScale {
  private times: number[] = [];
  private gap = 0;
  private candlesRef: ArrayLike<TimeScaleCandle> | null = null;
  private candlesSig = '';
  private spacing = DEFAULT_BAR_SPACING;
  private rightOffset = 0;
  private left = 0;
  private right = 0;
  /**
   * The exact ms range the current state was derived from (setVisibleTimeRange),
   * returned as is so writing it back to Chart.js is lossless. Cleared by any
   * other state change.
   */
  private exactRange: TimeRange | null = null;
  /** A time range requested before the plot had a width; applied on the first setPlot. */
  private pendingRange: TimeRange | null = null;

  // ── State ────────────────────────────────────────────────────────────────

  get barSpacingPx(): number {
    return this.spacing;
  }

  get rightOffsetBars(): number {
    return this.rightOffset;
  }

  get firstDataIndex(): number {
    return 0;
  }

  /** Index of the last candle, -1 without candles. */
  get lastDataIndex(): number {
    return this.times.length - 1;
  }

  get plotLeft(): number {
    return this.left;
  }

  get plotRight(): number {
    return this.right;
  }

  get plotWidth(): number {
    return this.right - this.left;
  }

  /** Average candle gap (ms) used beyond either end of the data, 0 when unknown. */
  get candleGap(): number {
    return this.gap;
  }

  get candleCount(): number {
    return this.times.length;
  }

  /** Logical index of the plot's right edge. */
  get rightLogical(): number {
    return this.lastDataIndex + this.rightOffset;
  }

  /** True when time <-> logical <-> x conversions are defined (>= 2 candles, a plot width). */
  get isReady(): boolean {
    return this.hasTimeAxis && this.plotWidth > 0;
  }

  private get hasTimeAxis(): boolean {
    return this.times.length >= 2 && this.gap > 0;
  }

  /**
   * Candle timestamps (sorted ascending). Unchanged input is skipped. The visible
   * time range is kept, so new candles never move the view (no realtime follow).
   */
  setCandles(candles: ArrayLike<TimeScaleCandle>): void {
    const n = candles?.length ?? 0;
    const sig = n ? `${n}|${candles[0].x}|${candles[n - 1].x}` : '0';
    if (candles === this.candlesRef && sig === this.candlesSig) return;
    const keep = this.isReady ? this.visibleTimeRange() : null;
    this.candlesRef = candles;
    this.candlesSig = sig;
    const times = new Array<number>(n);
    for (let i = 0; i < n; i++) times[i] = candles[i].x;
    const sameTimes =
      times.length === this.times.length && times.every((t, i) => t === this.times[i]);
    if (sameTimes) return;
    this.times = times;
    this.gap = averageCandleGap(candles);
    this.exactRange = null;
    if (!n) this.pendingRange = null;
    if (keep) this.setVisibleTimeRange(keep.min, keep.max);
  }

  /**
   * Plot edges (CSS px) whose rendered time range stays as is, e.g. after the
   * price axis got wider: bar spacing follows. See `resize` for container resizes.
   */
  setPlot(left: number, right: number): void {
    if (!isFiniteNumber(left) || !isFiniteNumber(right)) return;
    if (left === this.left && right === this.right) return;
    const keep = this.pendingRange ?? (this.isReady ? this.visibleTimeRange() : null);
    this.left = left;
    this.right = right;
    if (keep) this.setVisibleTimeRange(keep.min, keep.max);
  }

  /**
   * Container resize: bar spacing stays, so the number of visible bars changes.
   * At the live edge (last candle visible) the right edge keeps its right
   * offset; otherwise the logical center stays where it is.
   */
  resize(left: number, right: number): void {
    if (!isFiniteNumber(left) || !isFiniteNumber(right) || !(right - left > 0)) return;
    if (!this.isReady || this.pendingRange) {
      this.setPlot(left, right);
      return;
    }
    if (left === this.left && right === this.right) return;
    const live = this.isAtLiveEdge();
    const { from, to } = this.visibleLogicalRange();
    const center = (from + to) / 2;
    this.left = left;
    this.right = right;
    this.exactRange = null;
    if (!live) {
      this.rightOffset = center + (right - left) / this.spacing / 2 - this.lastDataIndex;
    }
  }

  /** True when the last candle is inside the visible logical range. */
  isAtLiveEdge(): boolean {
    if (!this.isReady) return false;
    const { from, to } = this.visibleLogicalRange();
    const last = this.lastDataIndex;
    return last >= from && last <= to;
  }

  /** Bar spacing clamped to [MIN_BAR_SPACING, MAX_BAR_SPACING]; the right edge stays. */
  setBarSpacing(px: number): void {
    this.spacing = clampBarSpacing(px, this.spacing);
    this.exactRange = null;
  }

  setRightOffsetBars(bars: number): void {
    if (!isFiniteNumber(bars)) return;
    this.rightOffset = bars;
    this.exactRange = null;
  }

  /** Show logical `from`..`to` across the plot. False when not applicable (no plot / invalid range). */
  setVisibleLogicalRange(from: number, to: number): boolean {
    if (!isFiniteNumber(from) || !isFiniteNumber(to) || !(to > from)) return false;
    if (!(this.plotWidth > 0) || this.times.length === 0) return false;
    const spacing = this.plotWidth / (to - from);
    if (!isFiniteNumber(spacing) || !(spacing > 0)) return false;
    this.spacing = spacing;
    this.rightOffset = to - this.lastDataIndex;
    this.exactRange = null;
    this.pendingRange = null;
    return true;
  }

  /**
   * Show `min`..`max` (ms) across the plot. Not clamped to MIN/MAX_BAR_SPACING,
   * so existing zoom limits keep working as before. Before the plot has a width
   * the range is kept and applied by the first `setPlot`.
   */
  setVisibleTimeRange(min: number, max: number): boolean {
    if (!isFiniteNumber(min) || !isFiniteNumber(max) || !(max > min) || !this.hasTimeAxis) return false;
    if (!(this.plotWidth > 0)) {
      this.pendingRange = { min, max };
      return false;
    }
    if (!this.setVisibleLogicalRange(this.timeToLogical(min), this.timeToLogical(max))) return false;
    this.exactRange = { min, max };
    return true;
  }

  // ── Mapping ──────────────────────────────────────────────────────────────

  logicalToX(logical: number): number {
    return this.right - (this.rightLogical - logical) * this.spacing;
  }

  xToLogical(x: number): number {
    return this.rightLogical - (this.right - x) / this.spacing;
  }

  /**
   * Fractional logical index of a timestamp; NaN without candles.
   * Index-based (interpolates between candles): see the note on `timeToX`.
   */
  timeToLogical(time: number): number {
    const t = this.times;
    const n = t.length;
    if (!n || !isFiniteNumber(time)) return NaN;
    const gap = this.gap;
    if (time <= t[0]) return time === t[0] ? 0 : gap > 0 ? (time - t[0]) / gap : NaN;
    if (time >= t[n - 1]) return time === t[n - 1] ? n - 1 : gap > 0 ? n - 1 + (time - t[n - 1]) / gap : NaN;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (t[mid] <= time) lo = mid;
      else hi = mid;
    }
    const span = t[hi] - t[lo];
    return span > 0 ? lo + (time - t[lo]) / span : lo;
  }

  /**
   * Timestamp of a fractional logical index; NaN without candles.
   * Index-based (interpolates between candles): see the note on `timeToX`.
   */
  logicalToTime(logical: number): number {
    const t = this.times;
    const n = t.length;
    if (!n || !isFiniteNumber(logical)) return NaN;
    if (logical <= 0) return t[0] + logical * this.gap;
    if (logical >= n - 1) return t[n - 1] + (logical - (n - 1)) * this.gap;
    const i = Math.floor(logical);
    return t[i] + (logical - i) * (t[i + 1] - t[i]);
  }

  /**
   * x of a timestamp in the logical (bar index) model.
   *
   * WARNING: index-based. Chart.js draws time LINEARLY across the plot, so for
   * unevenly spaced candles (monthly candles, data gaps, the area right of the
   * last candle when the last gap differs from the average) this differs from
   * where Chart.js actually draws the timestamp. Do NOT use it for hit-testing
   * or any pixel conversion while Chart.js renders: use `projectedTimeToX` /
   * `projectedXToTime` (linear over `visibleTimeRange()`, like
   * `timeRangeForPlot` / `timeSpanForPixels`) for anything pixel-facing.
   */
  timeToX(time: number): number {
    return this.logicalToX(this.timeToLogical(time));
  }

  /** Timestamp at x in the logical (bar index) model. WARNING: index-based, see `timeToX`. */
  xToTime(x: number): number {
    return this.logicalToTime(this.xToLogical(x));
  }

  /**
   * Time Chart.js draws at x (same frame as the plot): linear over
   * `visibleTimeRange()`, exact while Chart.js renders the projected range.
   * NaN when not ready. Use this for pixel-facing conversions.
   */
  projectedXToTime(x: number): number {
    const visible = this.visibleTimeRange();
    if (!this.isReady || !visible) return NaN;
    return visible.min + ((x - this.left) / this.plotWidth) * (visible.max - visible.min);
  }

  /** x at which Chart.js draws `time` (inverse of `projectedXToTime`); NaN when not ready. */
  projectedTimeToX(time: number): number {
    const visible = this.visibleTimeRange();
    if (!this.isReady || !visible || !(visible.max > visible.min)) return NaN;
    return this.left + ((time - visible.min) / (visible.max - visible.min)) * this.plotWidth;
  }

  visibleLogicalRange(): LogicalRange {
    const to = this.rightLogical;
    return { from: to - this.plotWidth / this.spacing, to };
  }

  /** Times at the plot edges, null when not ready. */
  visibleTimeRange(): TimeRange | null {
    if (!this.isReady) return this.pendingRange ? { ...this.pendingRange } : null;
    if (this.exactRange) return { ...this.exactRange };
    const { from, to } = this.visibleLogicalRange();
    return { min: this.logicalToTime(from), max: this.logicalToTime(to) };
  }

  /**
   * Times at a pane's plot edges (same x frame as this scale). A pane whose
   * Chart.js time axis gets this range maps every timestamp to the same
   * x as the main pane, whatever its own size or padding.
   */
  timeRangeForPlot(plot: PanePlot): TimeRange | null {
    if (!this.isReady || !isFiniteNumber(plot?.left) || !isFiniteNumber(plot?.right)) return null;
    if (!(plot.right > plot.left)) return null;
    const visible = this.visibleTimeRange();
    if (!visible) return null;
    if (plot.left === this.left && plot.right === this.right) return visible;
    // Chart.js time axes are linear in time: extend the visible range linearly.
    const msPerPx = (visible.max - visible.min) / this.plotWidth;
    return {
      min: visible.min + (plot.left - this.left) * msPerPx,
      max: visible.max + (plot.right - this.right) * msPerPx,
    };
  }

  /** Time span (ms) covered by `px` pixels of the plot at the current zoom; NaN when not ready. */
  timeSpanForPixels(px: number): number {
    const visible = this.visibleTimeRange();
    if (!this.isReady || !visible) return NaN;
    return (px / this.plotWidth) * (visible.max - visible.min);
  }

  /**
   * Project the visible range (or a pane's plot range) onto a Chart.js chart's
   * x-axis: scale min/max plus the option objects ng2-charts and Chart.js read.
   * Returns the range written, null when not ready.
   */
  applyToChart(chart: TimeScaleChartLike | null | undefined, pane?: PanePlot): TimeRange | null {
    const range = pane ? this.timeRangeForPlot(pane) : this.visibleTimeRange();
    if (!chart || !range) return null;
    writeXRange(chart, range);
    return range;
  }
}

/** Write an x range onto existing option objects — never spread Chart.js scale configs. */
export function writeXRange(chart: TimeScaleChartLike, range: TimeRange): void {
  const x = chart.scales?.x;
  if (x) {
    x.options = x.options ?? {};
    x.options.min = range.min;
    x.options.max = range.max;
    x.min = range.min;
    x.max = range.max;
  }
  for (const scales of [chart.options?.scales, chart.config?.options?.scales]) {
    const opts = scales?.['x'] as { min?: number; max?: number } | undefined;
    if (opts && typeof opts === 'object') {
      opts.min = range.min;
      opts.max = range.max;
    }
  }
}
