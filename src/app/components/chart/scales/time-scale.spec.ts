import {
  averageCandleGap,
  clampBarSpacing,
  DEFAULT_BAR_SPACING,
  MAX_BAR_SPACING,
  MIN_BAR_SPACING,
  sanitizeBarSpacing,
  TimeScale,
  TimeScaleChartLike,
} from './time-scale';

const HOUR = 3_600_000;

const hourly = (count: number, start = 0) => Array.from({ length: count }, (_, i) => ({ x: start + i * HOUR }));

/** Scale over `count` hourly candles, plot 10..810 (800px), showing hours `min`..`max`. */
function scaleWith(count = 100, min = 40 * HOUR, max = 60 * HOUR): TimeScale {
  const ts = new TimeScale();
  ts.setCandles(hourly(count));
  ts.setPlot(10, 810);
  ts.setVisibleTimeRange(min, max);
  return ts;
}

/** x of `time` on a Chart.js time axis (offset: false): linear between min/max over the plot. */
function chartJsX(time: number, range: { min: number; max: number }, plot: { left: number; right: number }): number {
  return plot.left + ((time - range.min) / (range.max - range.min)) * (plot.right - plot.left);
}

describe('TimeScale', () => {
  describe('logical <-> x', () => {
    it('follows x = plotRight - (rightLogical - logical) * barSpacing', () => {
      const ts = scaleWith();
      // 20 bars over 800px -> 40px per bar; right edge at logical 60 = lastIndex 99 - 39.
      expect(ts.barSpacingPx).toBe(40);
      expect(ts.rightOffsetBars).toBe(-39);
      expect(ts.rightLogical).toBe(60);
      expect(ts.logicalToX(60)).toBe(810);
      expect(ts.logicalToX(40)).toBe(10);
      expect(ts.logicalToX(50)).toBe(410);
    });

    it('xToLogical is the exact inverse, also for fractional indices', () => {
      const ts = scaleWith(100, 40.3 * HOUR, 61.7 * HOUR);
      for (const logical of [-12.25, 0, 0.5, 41.125, 50.5, 99, 99.75, 140.3333]) {
        expect(ts.xToLogical(ts.logicalToX(logical))).toBeCloseTo(logical, 9);
      }
      for (const x of [-100, 10, 10.5, 333.33, 809.99, 2000]) {
        expect(ts.logicalToX(ts.xToLogical(x))).toBeCloseTo(x, 9);
      }
    });

    it('projectedXToTime and projectedTimeToX are exact inverses (time-linear, also on uneven candles)', () => {
      const ts = new TimeScale();
      ts.setCandles([0, 1, 2, 7, 8, 9, 20].map((h) => ({ x: h * HOUR })));
      ts.setPlot(10, 810);
      ts.setVisibleTimeRange(2.3 * HOUR, 27.9 * HOUR);
      for (const x of [-250, 10, 10.5, 333.33, 410, 809.99, 810, 1500]) {
        expect(ts.projectedTimeToX(ts.projectedXToTime(x))).toBeCloseTo(x, 8);
      }
      for (const t of [-5 * HOUR, 2.3 * HOUR, 7 * HOUR, 19.999 * HOUR, 27.9 * HOUR, 40 * HOUR]) {
        expect(ts.projectedXToTime(ts.projectedTimeToX(t))).toBeCloseTo(t, 3);
      }
      expect(ts.projectedXToTime(10)).toBe(2.3 * HOUR);
      expect(ts.projectedXToTime(810)).toBe(27.9 * HOUR);
    });

    it('maps a halfway point between candles to a fractional index', () => {
      const ts = scaleWith();
      expect(ts.timeToLogical(50.5 * HOUR)).toBe(50.5);
      expect(ts.xToLogical(ts.logicalToX(50) + ts.barSpacingPx / 2)).toBeCloseTo(50.5, 12);
      expect(ts.xToTime(ts.timeToX(50.5 * HOUR))).toBeCloseTo(50.5 * HOUR, 3);
    });

    it('reports the visible logical and time range', () => {
      const ts = scaleWith();
      expect(ts.visibleLogicalRange()).toEqual({ from: 40, to: 60 });
      expect(ts.visibleTimeRange()).toEqual({ min: 40 * HOUR, max: 60 * HOUR });
    });
  });

  describe('time <-> logical', () => {
    it('interpolates between candles (binary search) and is the exact inverse', () => {
      const ts = new TimeScale();
      ts.setCandles([{ x: 0 }, { x: HOUR }, { x: 2 * HOUR }, { x: 4 * HOUR }]);
      expect(ts.timeToLogical(3 * HOUR)).toBe(2.5);
      expect(ts.logicalToTime(2.5)).toBe(3 * HOUR);
      expect(ts.timeToLogical(0)).toBe(0);
      expect(ts.timeToLogical(4 * HOUR)).toBe(3);
      for (const t of [0.25 * HOUR, 1.5 * HOUR, 2.1 * HOUR, 3.999 * HOUR]) {
        expect(ts.logicalToTime(ts.timeToLogical(t))).toBeCloseTo(t, 3);
      }
    });

    it('extrapolates beyond either end with the average candle gap', () => {
      const ts = new TimeScale();
      ts.setCandles([{ x: 0 }, { x: HOUR }, { x: 2 * HOUR }, { x: 4 * HOUR }]);
      const gap = (4 * HOUR) / 3;
      expect(ts.candleGap).toBeCloseTo(gap);
      expect(ts.timeToLogical(4 * HOUR + 2 * gap)).toBeCloseTo(5);
      expect(ts.logicalToTime(5)).toBeCloseTo(4 * HOUR + 2 * gap);
      expect(ts.timeToLogical(-gap / 2)).toBeCloseTo(-0.5);
      expect(ts.logicalToTime(-3)).toBeCloseTo(-3 * gap);
    });

    it('averageCandleGap uses the last 50 candles and is 0 when unknown', () => {
      const candles = [...hourly(10), ...hourly(60, 100 * HOUR).map((c) => ({ x: c.x * 2 }))];
      expect(averageCandleGap(candles)).toBe(2 * HOUR);
      expect(averageCandleGap([{ x: 5 }])).toBe(0);
      expect(averageCandleGap([{ x: 5 }, { x: 5 }])).toBe(0);
      expect(averageCandleGap([])).toBe(0);
    });

    it('returns NaN without candles or for non-finite input', () => {
      const ts = new TimeScale();
      expect(ts.timeToLogical(0)).toBeNaN();
      expect(ts.logicalToTime(0)).toBeNaN();
      ts.setCandles(hourly(10));
      expect(ts.timeToLogical(Number.NaN)).toBeNaN();
      expect(ts.logicalToTime(Number.POSITIVE_INFINITY)).toBeNaN();
    });
  });

  describe('bar spacing guards', () => {
    it('clamps to MIN/MAX and rejects NaN, Infinity, zero and negative values', () => {
      expect(MIN_BAR_SPACING).toBe(0.5);
      expect(MAX_BAR_SPACING).toBe(64);
      expect(DEFAULT_BAR_SPACING).toBe(12);
      expect(clampBarSpacing(0.1)).toBe(0.5);
      expect(clampBarSpacing(100)).toBe(64);
      expect(clampBarSpacing(7.25)).toBe(7.25);
      expect(clampBarSpacing(Number.NaN)).toBe(DEFAULT_BAR_SPACING);
      expect(clampBarSpacing(0)).toBe(DEFAULT_BAR_SPACING);
      expect(clampBarSpacing(-5)).toBe(DEFAULT_BAR_SPACING);
      expect(clampBarSpacing(Number.POSITIVE_INFINITY)).toBe(MAX_BAR_SPACING);
      expect(sanitizeBarSpacing(0.1)).toBe(0.1);
      expect(sanitizeBarSpacing(Number.NEGATIVE_INFINITY, 3)).toBe(3);
    });

    it('setBarSpacing clamps, keeps the right edge and ignores garbage', () => {
      const ts = scaleWith();
      ts.setBarSpacing(1000);
      expect(ts.barSpacingPx).toBe(MAX_BAR_SPACING);
      expect(ts.rightLogical).toBe(60);
      ts.setBarSpacing(Number.NaN);
      expect(ts.barSpacingPx).toBe(MAX_BAR_SPACING);
      ts.setBarSpacing(-1);
      expect(ts.barSpacingPx).toBe(MAX_BAR_SPACING);
      ts.setBarSpacing(0.01);
      expect(ts.barSpacingPx).toBe(MIN_BAR_SPACING);
    });

    it('rejects invalid ranges without touching the state', () => {
      const ts = scaleWith();
      expect(ts.setVisibleTimeRange(Number.NaN, 5)).toBe(false);
      expect(ts.setVisibleTimeRange(10, 10)).toBe(false);
      expect(ts.setVisibleTimeRange(10, 5)).toBe(false);
      expect(ts.setVisibleLogicalRange(3, Number.POSITIVE_INFINITY)).toBe(false);
      ts.setRightOffsetBars(Number.NaN);
      expect(ts.visibleTimeRange()).toEqual({ min: 40 * HOUR, max: 60 * HOUR });
      expect(ts.barSpacingPx).toBe(40);
    });

    it('is not ready without a plot or with fewer than two candles', () => {
      const ts = new TimeScale();
      expect(ts.isReady).toBe(false);
      expect(ts.visibleTimeRange()).toBeNull();
      ts.setCandles([{ x: 0 }]);
      ts.setPlot(0, 100);
      expect(ts.isReady).toBe(false);
      expect(ts.setVisibleTimeRange(0, HOUR)).toBe(false);
      expect(ts.applyToChart({ scales: { x: {} } })).toBeNull();
    });
  });

  describe('state', () => {
    it('applies a range requested before the plot had a width', () => {
      const ts = new TimeScale();
      ts.setCandles(hourly(100));
      expect(ts.setVisibleTimeRange(40 * HOUR, 60 * HOUR)).toBe(false);
      ts.setPlot(0, 400);
      expect(ts.visibleTimeRange()).toEqual({ min: 40 * HOUR, max: 60 * HOUR });
      expect(ts.barSpacingPx).toBe(20);
    });

    it('keeps the visible time range when candles are appended (no realtime follow)', () => {
      const ts = scaleWith();
      ts.setCandles(hourly(101));
      expect(ts.visibleTimeRange()).toEqual({ min: 40 * HOUR, max: 60 * HOUR });
      expect(ts.lastDataIndex).toBe(100);
      expect(ts.rightOffsetBars).toBeCloseTo(-40);
    });

    it('keeps the visible range when the plot edges move without a resize (axis width)', () => {
      const ts = scaleWith();
      ts.setPlot(10, 770);
      expect(ts.visibleTimeRange()).toEqual({ min: 40 * HOUR, max: 60 * HOUR });
      expect(ts.barSpacingPx).toBeCloseTo(38);
    });

    it('applyToChart writes scale min/max and the option objects', () => {
      const ts = scaleWith();
      const chart: TimeScaleChartLike = {
        scales: { x: { options: {} } },
        options: { scales: { x: {} } },
        config: { options: { scales: { x: {} } } },
      };
      expect(ts.applyToChart(chart)).toEqual({ min: 40 * HOUR, max: 60 * HOUR });
      expect(chart.scales!.x).toEqual({ min: 40 * HOUR, max: 60 * HOUR, options: { min: 40 * HOUR, max: 60 * HOUR } });
      expect(chart.options!.scales!['x']).toEqual({ min: 40 * HOUR, max: 60 * HOUR });
      expect(chart.config!.options!.scales!['x']).toEqual({ min: 40 * HOUR, max: 60 * HOUR });
    });
  });

  describe('resize', () => {
    it('at the live edge keeps bar spacing and the right offset (right edge anchored)', () => {
      // Default-view-like: last candle 99 visible, 3.5 bars of space after it.
      const ts = scaleWith(100, 99.5 * HOUR - 64 * HOUR, 102.5 * HOUR);
      const spacing = ts.barSpacingPx;
      const offset = ts.rightOffsetBars;
      expect(ts.isAtLiveEdge()).toBe(true);
      ts.resize(10, 1210);
      expect(ts.barSpacingPx).toBe(spacing);
      expect(ts.rightOffsetBars).toBe(offset);
      expect(ts.visibleTimeRange()!.max).toBeCloseTo(102.5 * HOUR, 3);
      expect(ts.visibleLogicalRange().to - ts.visibleLogicalRange().from).toBeCloseTo(1200 / spacing);
      ts.resize(10, 410);
      expect(ts.rightOffsetBars).toBe(offset);
      expect(ts.visibleTimeRange()!.max).toBeCloseTo(102.5 * HOUR, 3);
    });

    it('away from the live edge keeps bar spacing and the logical center', () => {
      const ts = scaleWith(); // logical 40..60, last candle 99 not visible
      expect(ts.isAtLiveEdge()).toBe(false);
      ts.resize(10, 1210);
      expect(ts.barSpacingPx).toBe(40);
      const { from, to } = ts.visibleLogicalRange();
      expect((from + to) / 2).toBeCloseTo(50, 9);
      expect(to - from).toBeCloseTo(30, 9);
      ts.resize(110, 510);
      const r = ts.visibleLogicalRange();
      expect((r.from + r.to) / 2).toBeCloseTo(50, 9);
      expect(r.to - r.from).toBeCloseTo(10, 9);
    });

    it('ignores invalid sizes', () => {
      const ts = scaleWith();
      ts.resize(10, 10);
      ts.resize(Number.NaN, 500);
      expect(ts.plotWidth).toBe(800);
      expect(ts.visibleTimeRange()).toEqual({ min: 40 * HOUR, max: 60 * HOUR });
    });
  });

  describe('main vs linked pane alignment', () => {
    // Main pane: canvas at client x 0, plot 10..810. The TimeScale frame is main-canvas px.
    const mainPlot = { left: 10, right: 810 };
    const panes = [
      // MCB canvas at client 3, rounded padding leaves its plot 0.4px right / 0.3px left of the main plot.
      { canvasLeft: 3, localLeft: 7.4, localRight: 806.7 },
      // Narrower pane (axis gutter not caught up yet) with a different left padding.
      { canvasLeft: -20, localLeft: 30.2, localRight: 760 },
      // Wider canvas, same plot edges.
      { canvasLeft: 0, localLeft: 10, localRight: 810 },
    ];
    const times = [41 * HOUR, 45.5 * HOUR, 50 * HOUR, 58.25 * HOUR, 59.9 * HOUR];

    const assertAligned = (ts: TimeScale) => {
      const main = { scales: { x: { options: {} } } } as TimeScaleChartLike;
      const mainRange = ts.applyToChart(main)!;
      for (const pane of panes) {
        // Pane plot edges in the TimeScale (main canvas) frame.
        const plot = { left: pane.canvasLeft + pane.localLeft, right: pane.canvasLeft + pane.localRight };
        const chart = { scales: { x: { options: {} } } } as TimeScaleChartLike;
        const paneRange = ts.applyToChart(chart, plot)!;
        expect(chart.scales!.x!.options).toEqual(paneRange);
        for (const t of times) {
          const mainX = chartJsX(t, mainRange, mainPlot);
          const paneX = pane.canvasLeft + chartJsX(t, paneRange, { left: pane.localLeft, right: pane.localRight });
          expect(Math.abs(mainX - paneX)).toBeLessThan(0.5);
          expect(Math.abs(mainX - ts.timeToX(t))).toBeLessThan(0.5);
        }
      }
    };

    it('maps every timestamp to the same x in panes of different sizes/paddings', () => {
      assertAligned(scaleWith(100, 40.2 * HOUR, 61.3 * HOUR));
    });

    it('does not accumulate alignment error over repeated zoom in/out', () => {
      const ts = scaleWith();
      let range = { min: 40 * HOUR, max: 60 * HOUR };
      for (let i = 0; i < 200; i++) {
        const factor = i % 2 ? 1 / 1.1 : 1.1;
        const width = (range.max - range.min) * factor;
        range = { min: range.max - width, max: range.max };
        ts.setVisibleTimeRange(range.min, range.max);
      }
      expect(ts.visibleTimeRange()!.max).toBe(60 * HOUR);
      assertAligned(ts);
    });
  });
});
