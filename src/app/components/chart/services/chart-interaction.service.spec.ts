/**
 * Range math of ChartInteractionService (pan / zoom / fit / overscroll) on a
 * plain chart stub. With isInteracting=false every update runs synchronously.
 */
import { TestBed } from '@angular/core/testing';
import { ChartInteractionService } from './chart-interaction.service';
import { ChartLinkedScaleService } from './chart-linked-scale.service';
import { MAX_BAR_SPACING, MIN_BAR_SPACING, TIME_AXIS_SCALE_SENSITIVITY } from '../scales/time-scale';

const STEP = 1000;

function candles(count = 100) {
  return Array.from({ length: count }, (_, i) => ({ x: i * STEP, h: 110 + i, l: 90 + i }));
}

function chartRef(data = candles(), x = { min: 40_000, max: 60_000 }, y = { min: 0, max: 300 }) {
  return {
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect },
    chartArea: { left: 0, right: 800, top: 0, bottom: 600 },
    scales: {
      x: { ...x, options: {} as { min?: number; max?: number } },
      y: { ...y, options: {} as { min?: number; max?: number } },
    },
    data: { datasets: [{ type: 'candlestick', data }] as Array<Record<string, unknown>> },
    config: { options: { scales: {} } },
    width: 800,
    height: 600,
    update: vi.fn(),
    draw: vi.fn(),
  };
}

type Ref = ReturnType<typeof chartRef>;
const asRef = (r: Ref) => r as unknown as Parameters<ChartInteractionService['zoomHorizontal']>[1];

describe('ChartInteractionService', () => {
  let service: ChartInteractionService;

  beforeEach(() => {
    service = TestBed.inject(ChartInteractionService);
    service.isInteracting = false;
    service.setRanges({ min: 0, max: 99_000 }, { min: -10_000, max: 109_000 }, { min: 90, max: 209 });
  });

  describe('computeExtendedRange', () => {
    it('adds an overscroll buffer of max(15% range, 40 candles), capped at 40%', () => {
      service.computeExtendedRange(candles());
      // range 99000; 15% = 14850; 40 candles = 40000; cap 39600
      expect(service.extendedDataRange).toEqual({ min: -39_600, max: 138_600 });

      service.computeExtendedRange(candles(1000));
      // range 999000; 15% = 149850 > 40 candles; below the 40% cap
      expect(service.extendedDataRange).toEqual({ min: -149_850, max: 999_000 + 149_850 });
    });

    it('falls back to the full data range with fewer than two candles', () => {
      service.computeExtendedRange([{ x: 5 }]);
      expect(service.extendedDataRange).toEqual({ min: 0, max: 99_000 });
    });
  });

  describe('zoomHorizontal', () => {
    it('zooms with the right edge fixed (TradingView)', () => {
      const ref = chartRef();
      service.zoomHorizontal(1.1, asRef(ref));
      expect(ref.scales.x.options).toEqual({ min: 38_000, max: 60_000 });
      expect(ref.scales.x.min).toBe(38_000);
      expect(ref.update).toHaveBeenCalledWith('none');
    });

    it('keeps at least MIN_CANDLES_VISIBLE candles in view', () => {
      const ref = chartRef();
      service.zoomHorizontal(0.01, asRef(ref));
      // avg width = 99000 / 100 = 990; 10 candles = 9900
      expect(ref.scales.x.max - ref.scales.x.min).toBeCloseTo(9_900);
      expect(ref.scales.x.max).toBeCloseTo(60_000);
    });

    it('never zooms out beyond 98% of the data range', () => {
      const ref = chartRef();
      service.zoomHorizontal(100, asRef(ref));
      expect(ref.scales.x.max - ref.scales.x.min).toBeCloseTo(97_020);
    });

    it('clamps the zoomed range into the overscroll range', () => {
      const ref = chartRef(candles(), { min: 100_000, max: 112_000 });
      service.zoomHorizontal(2, asRef(ref));
      // 88000..112000 sticks out past the overscroll max 109000
      expect(ref.scales.x.options).toEqual({ min: 85_000, max: 109_000 });
    });

    it('re-fits the y-axis to the visible candles and order lines', () => {
      const ref = chartRef();
      ref.data.datasets.push({ isOrder: true, data: [{ x: 0, y: 500 }, { x: 99_000, y: 500 }] });
      service.zoomHorizontal(1, asRef(ref));
      // visible candles 40..60: lows 130..150, highs 150..170; order line at 500
      const min = 130;
      const max = 500;
      const buffer = (max - min) * 0.05;
      expect(ref.scales.y.options.min).toBeCloseTo(min - buffer);
      expect(ref.scales.y.options.max).toBeCloseTo(max + buffer);
    });

    it('does nothing without data', () => {
      const ref = chartRef([]);
      service.zoomHorizontal(2, asRef(ref));
      expect(ref.scales.x.options).toEqual({});
    });
  });

  describe('anchored zoom', () => {
    it('keeps the anchor at the same position in the range', () => {
      const ref = chartRef();
      // Anchor 45000 sits at 25% of 40000..60000; zoom out 2x -> range 40000.
      service.zoomHorizontal(2, asRef(ref), 45_000);
      expect(ref.scales.x.options).toEqual({ min: 35_000, max: 75_000 });
    });

    it('falls back to the right edge for an anchor outside the visible range', () => {
      const ref = chartRef();
      service.zoomHorizontal(1.1, asRef(ref), 90_000);
      expect(ref.scales.x.options).toEqual({ min: 38_000, max: 60_000 });
    });

    it('maps a viewport x to the time under it, null outside the plot', () => {
      const ref = chartRef();
      expect(service.xValueAtClientX(asRef(ref), 200)).toBe(45_000);
      expect(service.xValueAtClientX(asRef(ref), 900)).toBeNull();
    });

    it('xValueAtClientX is time-linear like Chart.js, also for unevenly spaced candles', () => {
      const uneven = [0, 1000, 2000, 7000, 8000, 9000, 20_000].map((x) => ({ x, h: 110, l: 90 }));
      const ref = chartRef(uneven, { min: 0, max: 20_000 });
      // Chart.js draws 0..20000 linearly over 0..800px: 300px -> 7500 (index-based would differ).
      expect(service.xValueAtClientX(asRef(ref), 300)).toBeCloseTo(7_500, 6);
      expect(service.xValueAtClientX(asRef(ref), 50)).toBeCloseTo(1_250, 6);
      // Right of the last candle, where the last gap differs from the average gap.
      const right = chartRef(uneven, { min: 10_000, max: 30_000 });
      expect(service.xValueAtClientX(asRef(right), 700)).toBeCloseTo(27_500, 6);
    });

    it('xValueAtClientX does not use the previous symbol after a switch (no candles yet)', () => {
      expect(service.xValueAtClientX(asRef(chartRef()), 200)).toBe(45_000);
      expect(service.timeScale.isReady).toBe(true);
      // New symbol mid-load: no candles, a different x-range.
      const loading = chartRef([], { min: 100_000, max: 120_000 });
      expect(service.xValueAtClientX(asRef(loading), 200)).toBe(105_000);
      expect(service.timeScale.candleCount).toBe(0);
      expect(service.timeScale.isReady).toBe(false);
    });

    it('xValueAtClientX on the linked MCB pane uses the main chart, and not once the main has no candles', () => {
      const linked = TestBed.inject(ChartLinkedScaleService);
      const main = chartRef();
      linked.syncMcbFromRenderedMain(main as never); // registers the main chart
      const mcb = {
        ...chartRef([], { min: 0, max: 1 }),
        data: { datasets: [{ type: 'line', data: [] }] },
        canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect, dataset: { linkedPanel: 'mcb' } },
      };
      expect(service.xValueAtClientX(asRef(mcb as unknown as Ref), 200)).toBe(45_000);
      main.data.datasets[0]['data'] = [];
      expect(service.xValueAtClientX(asRef(mcb as unknown as Ref), 200)).toBe(0.25);
    });

    it('wheel keeps the right edge fixed wherever the cursor is', () => {
      const ref = chartRef();
      const event = { deltaY: -1, clientX: 200, preventDefault: vi.fn() } as unknown as WheelEvent;
      service.onWheel(event, asRef(ref));
      // 0.9x with 60000 fixed: range 18000.
      expect(ref.scales.x.options.min).toBeCloseTo(42_000);
      expect(ref.scales.x.options.max).toBeCloseTo(60_000);
    });

    it('wheel over a linked panel also keeps the right edge fixed', () => {
      const ref = chartRef();
      const event = { deltaY: 1, clientX: 0, preventDefault: vi.fn() } as unknown as WheelEvent;
      service.onWheel(event, asRef(ref), 45_000);
      expect(ref.scales.x.options.min).toBeCloseTo(38_000);
      expect(ref.scales.x.options.max).toBeCloseTo(60_000);
    });
  });

  it('zoomVertical scales the y-range around its centre', () => {
    const ref = chartRef(candles(), undefined, { min: 0, max: 100 });
    service.zoomVertical(2, asRef(ref));
    expect(ref.scales.y.options).toEqual({ min: -50, max: 150 });
  });

  describe('mouse pan', () => {
    const mouse = (x: number, y: number, button = 0) =>
      ({ button, clientX: x, clientY: y }) as MouseEvent;

    it('pans the x-range by the dragged fraction of the chart width', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, 300), asRef(ref));
      expect(service.gestureType).toBe('pan');
      expect(service.isInteracting).toBe(true);
      service.isInteracting = false; // run the update synchronously
      service.gestureType = 'pan';
      service.onMouseMove(mouse(480, 300), asRef(ref));
      // 80px of 800px = 10% of a 20000 range -> 2000 back in time
      expect(ref.scales.x.options).toEqual({ min: 38_000, max: 58_000 });

      service.onMouseUp(mouse(480, 300), asRef(ref));
      expect(service.gestureType).toBeNull();
      expect(service.isInteracting).toBe(false);
    });

    it('pans by the dragged fraction of the plot width, not the canvas width', () => {
      const ref = { ...chartRef(), width: 1000 }; // 800px plot + 200px price axis/padding
      service.onMouseDown(mouse(400, 300), asRef(ref));
      service.isInteracting = false;
      service.onMouseMove(mouse(480, 300), asRef(ref));
      // 80px of the 800px plot = 10% of 20000 (the canvas width would give 1600)
      expect(ref.scales.x.options).toEqual({ min: 38_000, max: 58_000 });
    });

    it('does not pan past the overscroll range', () => {
      const ref = chartRef(candles(), { min: 0, max: 20_000 });
      service.onMouseDown(mouse(0, 0), asRef(ref));
      service.isInteracting = false;
      service.onMouseMove(mouse(800, 0), asRef(ref));
      expect(ref.scales.x.options).toEqual({ min: -10_000, max: 10_000 });
    });

    it('ignores non-primary buttons', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(10, 10, 2), asRef(ref));
      expect(service.gestureType).toBeNull();
      service.onMouseMove(mouse(100, 10), asRef(ref));
      expect(ref.scales.x.options).toEqual({});
    });
  });

  describe('price axis (TradingView)', () => {
    const mouse = (x: number, y: number, button = 0) =>
      ({ button, clientX: x, clientY: y }) as MouseEvent;
    // chartArea is 0..800 x 0..600; the price axis sits right of the plot.

    it('detects the price and time axis', () => {
      const ref = chartRef();
      expect(service.axisAt(asRef(ref), 850, 300)).toBe('y');
      expect(service.axisAt(asRef(ref), 400, 650)).toBe('x');
      expect(service.axisAt(asRef(ref), 400, 300)).toBeNull();
    });

    it('drag down on the price axis compresses, drag up stretches, around the centre', () => {
      const ref = chartRef(candles(), undefined, { min: 0, max: 100 });
      service.onMouseDown(mouse(850, 300), asRef(ref));
      expect(service.gestureType).toBe('zoom-y');
      service.isInteracting = false;
      service.onMouseMove(mouse(850, 400), asRef(ref));
      const grown = ref.scales.y.options.max! - ref.scales.y.options.min!;
      expect(grown).toBeCloseTo(100 * Math.exp(0.6));
      expect((ref.scales.y.options.min! + ref.scales.y.options.max!) / 2).toBeCloseTo(50);
      // scales from the start range, not cumulatively
      service.onMouseMove(mouse(850, 200), asRef(ref));
      expect(ref.scales.y.options.max! - ref.scales.y.options.min!).toBeCloseTo(100 * Math.exp(-0.6));
      expect(ref.scales.x.options).toEqual({});
      service.onMouseUp(mouse(850, 200), asRef(ref));
      expect(service.gestureType).toBeNull();
    });

    it('wheel over the price axis scales y instead of zooming time', () => {
      const ref = chartRef(candles(), undefined, { min: 0, max: 100 });
      const event = { deltaY: 1, clientX: 850, clientY: 300, preventDefault: vi.fn() } as unknown as WheelEvent;
      service.onWheel(event, asRef(ref));
      expect(ref.scales.y.options.min).toBeCloseTo(-5);
      expect(ref.scales.y.options.max).toBeCloseTo(105);
      expect(ref.scales.x.options).toEqual({});
    });

    it('a manual price scale survives time zoom until auto scale is forced back', () => {
      const ref = chartRef(candles(), undefined, { min: 0, max: 100 });
      service.onMouseDown(mouse(850, 300), asRef(ref));
      service.isInteracting = false;
      service.onMouseMove(mouse(850, 400), asRef(ref));
      service.onMouseUp(mouse(850, 400), asRef(ref));
      expect(service.yAutoScale).toBe(false);
      const manual = { ...ref.scales.y.options };
      service.zoomHorizontal(1.1, asRef(ref));
      expect(ref.scales.y.options).toEqual(manual);

      service.autoFitYScale(asRef(ref), true);
      expect(service.yAutoScale).toBe(true);
      // after the 1.1x zoom candles 38..60 are visible: lows 128..150, highs 148..170
      expect(ref.scales.y.options.min).toBeCloseTo(128 - 2.1);
      expect(ref.scales.y.options.max).toBeCloseTo(170 + 2.1);
    });
  });

  describe('time-axis drag scale (anchored)', () => {
    const mouse = (x: number, y: number, button = 0) =>
      ({ button, clientX: x, clientY: y }) as MouseEvent;
    const AXIS_Y = 650; // below the plot (bottom 600) = time-axis region
    // 800px plot over 40000..60000 = 20 bars = 40px per bar; x = 200 -> 45000, x = 600 -> 55000.
    const docMove = (x: number, y = AXIS_Y) =>
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
    const docUp = (x: number, y = AXIS_Y) =>
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y }));
    const range = (ref: Ref) => ({ min: ref.scales.x.options.min!, max: ref.scales.x.options.max! });

    afterEach(() => docUp(0));

    it('keeps the time under the press at the press x while dragging right and left (25% and 75%)', () => {
      for (const [startX, anchor] of [[200, 45_000], [600, 55_000]] as const) {
        const ref = chartRef();
        service.onMouseDown(mouse(startX, AXIS_Y), asRef(ref));
        service.isInteracting = false;
        expect(service.gestureType).toBe('zoom-x');
        const ts = service.timeScale;
        const startSpacing = ts.barSpacingPx;
        let last = startSpacing;
        for (const dx of [10, 25, 50, 20, 0, -20, -60, -100, -30]) {
          docMove(startX + dx);
          expect(ts.projectedTimeToX(anchor)).toBeCloseTo(startX, 6);
          if (dx !== 0) expect(ts.barSpacingPx).not.toBe(last);
          last = ts.barSpacingPx;
          expect(ts.barSpacingPx).toBeCloseTo(startSpacing * Math.exp(dx * TIME_AXIS_SCALE_SENSITIVITY), 6);
          // Chart.js gets the same range the TimeScale shows.
          expect(range(ref)).toEqual(ts.visibleTimeRange());
        }
        docUp(startX);
        service.onMouseUp(mouse(startX, AXIS_Y), asRef(ref));
      }
    });

    it('drag right widens the candles (fewer visible bars), drag left narrows them', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, AXIS_Y), asRef(ref));
      service.isInteracting = false;
      const ts = service.timeScale;
      const startSpacing = ts.barSpacingPx;
      const startSpan = ref.scales.x.max - ref.scales.x.min;
      docMove(440);
      expect(ts.barSpacingPx).toBeGreaterThan(startSpacing);
      expect(range(ref).max - range(ref).min).toBeLessThan(startSpan);
      docMove(360);
      expect(ts.barSpacingPx).toBeLessThan(startSpacing);
      expect(range(ref).max - range(ref).min).toBeGreaterThan(startSpan);
    });

    it('computes from the press state, so the path of the pointer does not matter', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(300, AXIS_Y), asRef(ref));
      service.isInteracting = false;
      docMove(500);
      docMove(100);
      docMove(340);
      const wandered = { ...range(ref) };
      docUp(340);
      service.onMouseUp(mouse(340, AXIS_Y), asRef(ref));

      const direct = chartRef();
      service.onMouseDown(mouse(300, AXIS_Y), asRef(direct));
      service.isInteracting = false;
      docMove(340);
      expect(range(direct).min).toBeCloseTo(wandered.min, 6);
      expect(range(direct).max).toBeCloseTo(wandered.max, 6);
    });

    it('clamps to MIN/MAX_BAR_SPACING and the data limits, never producing an invalid range', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, AXIS_Y), asRef(ref));
      service.isInteracting = false;
      const ts = service.timeScale;
      docMove(400 + 5000);
      expect(ts.barSpacingPx).toBeLessThanOrEqual(MAX_BAR_SPACING + 1e-9);
      expect(ts.barSpacingPx).toBeCloseTo(MAX_BAR_SPACING, 6);
      expect(ts.projectedTimeToX(50_000)).toBeCloseTo(400, 6); // no limit bites: the anchor holds
      docMove(400 - 5000);
      const r = range(ref);
      expect(Number.isFinite(r.min) && Number.isFinite(r.max) && r.max > r.min).toBe(true);
      expect(r.min).toBeGreaterThanOrEqual(service.extendedDataRange.min);
      expect(r.max).toBeLessThanOrEqual(service.extendedDataRange.max);
      expect(ts.barSpacingPx).toBeGreaterThanOrEqual(MIN_BAR_SPACING);
      expect(Number.isFinite(ts.barSpacingPx)).toBe(true);
    });

    it('ignores NaN / Infinity pointer positions', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, AXIS_Y), asRef(ref));
      service.isInteracting = false;
      docMove(440);
      const before = { ...range(ref) };
      service.updateTimeAxisScale(NaN);
      service.updateTimeAxisScale(Infinity);
      service.updateTimeAxisScale(-Infinity);
      expect(range(ref)).toEqual(before);
      expect(Number.isFinite(service.timeScale.barSpacingPx)).toBe(true);
    });

    it('does not start without a ready TimeScale', () => {
      service.onMouseDown(mouse(400, AXIS_Y), asRef(chartRef([])));
      expect(service.isTimeAxisScaling).toBe(false);
    });

    it('scales instead of panning, also for container-level mouse moves', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, AXIS_Y), asRef(ref));
      service.isInteracting = false;
      service.onMouseMove(mouse(480, AXIS_Y), asRef(ref));
      expect(service.gestureType).toBe('zoom-x');
      expect(service.timeScale.projectedTimeToX(50_000)).toBeCloseTo(400, 6);
      expect(range(ref).max - range(ref).min).toBeLessThan(20_000);
    });

    it('keeps following the pointer outside the chart and ends on release anywhere', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, AXIS_Y), asRef(ref));
      service.isInteracting = false;
      docMove(1500, -300); // far outside the axis and the chart
      expect(service.timeScale.barSpacingPx).toBeCloseTo(
        Math.min(MAX_BAR_SPACING, 40 * Math.exp(1100 * TIME_AXIS_SCALE_SENSITIVITY)),
        6,
      );
      const ended = vi.fn();
      service.onTimeAxisScaleEnd = ended;
      docUp(1500, -300);
      expect(ended).toHaveBeenCalled();
      expect(service.gestureType).toBeNull();
      expect(service.isInteracting).toBe(false);
      expect(service.isTimeAxisScaling).toBe(false);
      expect((ref as { _isInteracting?: boolean })._isInteracting).toBe(false);
      service.onTimeAxisScaleEnd = undefined;
      const final = { ...range(ref) };
      docMove(100); // listeners are gone; the scale persists
      expect(range(ref)).toEqual(final);
    });

    it('removes the document listeners on destroy', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, AXIS_Y), asRef(ref));
      service.isInteracting = false;
      service.ngOnDestroy();
      expect(service.isTimeAxisScaling).toBe(false);
      const before = { ...range(ref) };
      docMove(600);
      expect(range(ref)).toEqual(before);
    });

    it('a swipe on the time axis (touch) uses the same anchored algorithm', () => {
      const ref = chartRef();
      const touch = (x: number, y: number) =>
        ({ touches: [{ clientX: x, clientY: y }], preventDefault: vi.fn() }) as unknown as TouchEvent;
      service.onTouchStart(touch(200, AXIS_Y), asRef(ref));
      service.isInteracting = false;
      service.onTouchMove(touch(230, AXIS_Y), asRef(ref));
      expect(service.gestureType).toBe('zoom-x');
      service.isInteracting = false;
      service.onTouchMove(touch(260, AXIS_Y), asRef(ref));
      const ts = service.timeScale;
      expect(ts.projectedTimeToX(45_000)).toBeCloseTo(200, 6);
      expect(ts.barSpacingPx).toBeCloseTo(40 * Math.exp(60 * TIME_AXIS_SCALE_SENSITIVITY), 6);
      service.onTouchEnd({ touches: [] } as unknown as TouchEvent, asRef(ref));
      expect(service.gestureType).toBeNull();
      expect(service.isTimeAxisScaling).toBe(false);
    });

    it('main and MCB ranges stay identical through the whole gesture', () => {
      const linked = TestBed.inject(ChartLinkedScaleService);
      const ref = chartRef();
      service.onMouseDown(mouse(200, AXIS_Y), asRef(ref));
      service.isInteracting = false;
      const ts = service.timeScale;
      for (const dx of [20, 60, -10, -80, 0]) {
        docMove(200 + dx);
        const main = range(ref);
        // The MCB pane shares the main plot edges here: its range is the TimeScale range for them.
        const pushed = linked.pushXRangeFromMain(ref as never)!;
        expect(pushed.xMin).toBeCloseTo(main.min, 6);
        expect(pushed.xMax).toBeCloseTo(main.max, 6);
        const pane = ts.timeRangeForPlot({ left: ts.plotLeft, right: ts.plotRight })!;
        expect(pane.min).toBe(main.min);
        expect(pane.max).toBe(main.max);
      }
    });
  });

  it('onWheel zooms out on scroll down and in on scroll up', () => {
    const ref = chartRef();
    const wheel = (deltaY: number) => ({ deltaY, preventDefault: vi.fn() }) as unknown as WheelEvent;
    const down = wheel(10);
    service.onWheel(down, asRef(ref));
    expect(down.preventDefault).toHaveBeenCalled();
    expect(ref.scales.x.max - ref.scales.x.min).toBeCloseTo(22_000);
    service.onWheel(wheel(-10), asRef(ref));
    expect(ref.scales.x.max - ref.scales.x.min).toBeCloseTo(19_800);
  });

  it('fitToData shows the full range with a y buffer of one data range', () => {
    const ref = chartRef();
    service.fitToData(asRef(ref));
    expect(ref.scales.x.options).toEqual({ min: 0, max: 99_000 });
    expect(ref.scales.y.options).toEqual({ min: 90 - 119, max: 209 + 119 });
  });

  describe('zoomToRecent (default view)', () => {
    it('shows candles at 12px each with the current candle on the right and fits y', () => {
      const data = candles(150);
      const ref = chartRef(data, { min: 0, max: 149_000 });
      service.computeExtendedRange(data);
      service.yAutoScale = false;
      service.zoomToRecent(asRef(ref));
      // 800px / 12 = 67 slots: 64 candles + 3 empty bars after the last one
      expect(ref.scales.x.options.max).toBeCloseTo(149_000 + 3.5 * STEP);
      expect(ref.scales.x.options.min).toBeCloseTo(149_000 + 3.5 * STEP - 67 * STEP);
      expect(service.yAutoScale).toBe(true);
      // candles 86..149 visible: lows 176..239, highs 196..259 -> buffer 4.15
      expect(ref.scales.y.options.min).toBeCloseTo(176 - 4.15);
      expect(ref.scales.y.options.max).toBeCloseTo(259 + 4.15);
    });

    it('uses the given candles when the chart has not received them yet', () => {
      const data = candles(150);
      const ref = chartRef(candles(10), { min: 0, max: 9_000 });
      service.computeExtendedRange(data);
      service.zoomToRecent(asRef(ref), data);
      expect(ref.scales.x.options.max).toBeCloseTo(149_000 + 3.5 * STEP);
      expect(ref.scales.y.options.max).toBeCloseTo(259 + 4.15);
    });

    it('recentRange gives the same range without a chart', () => {
      const data = candles(150);
      service.computeExtendedRange(data);
      const range = service.recentRange(data, 800)!;
      expect(range.xMax).toBeCloseTo(149_000 + 3.5 * STEP);
      expect(range.xMin).toBeCloseTo(149_000 + 3.5 * STEP - 67 * STEP);
      expect(range.yMin).toBeCloseTo(176 - 4.15);
      expect(range.yMax).toBeCloseTo(259 + 4.15);
      expect(service.recentRange([{ x: 0 }], 800)).toBeNull();
    });

    it('resetZoom returns to the default view', () => {
      const data = candles(150);
      const ref = chartRef(data);
      service.computeExtendedRange(data);
      service.resetZoom(asRef(ref));
      expect(ref.scales.x.options.max).toBeCloseTo(149_000 + 3.5 * STEP);
      expect(ref.scales.x.options.min).toBeCloseTo(149_000 + 3.5 * STEP - 67 * STEP);
    });
  });

  describe('zoomToLatest', () => {
    it('zooms in to the last 100 candles plus 3 bars right padding and fits y', () => {
      const data = candles(300);
      const ref = chartRef(data, { min: 0, max: 299_000 });
      service.computeExtendedRange(data);
      service.yAutoScale = false;
      service.zoomToLatest(asRef(ref));
      expect(ref.scales.x.options.max).toBeCloseTo(299_000 + 3.5 * STEP);
      expect(ref.scales.x.options.min).toBeCloseTo(299_000 + 3.5 * STEP - 103 * STEP);
      expect(service.yAutoScale).toBe(true);
      // candles 200..299 visible: lows 290..389, highs 310..409 -> buffer 5.95
      expect(ref.scales.y.options.min).toBeCloseTo(290 - 5.95);
      expect(ref.scales.y.options.max).toBeCloseTo(409 + 5.95);
    });

    it('keeps a closer zoom level and only moves it to the latest candle', () => {
      const data = candles(300);
      const ref = chartRef(data, { min: 100_000, max: 120_000 });
      service.computeExtendedRange(data);
      service.zoomToLatest(asRef(ref));
      const range = ref.scales.x.options.max! - ref.scales.x.options.min!;
      expect(range).toBeCloseTo(20 * STEP);
      expect(ref.scales.x.options.max).toBeCloseTo(299_000 + 3.5 * STEP);
    });
  });

  it('syncIndicatorAxis mirrors the y-range onto the hidden indicator axis', () => {
    const ref = chartRef(candles(), undefined, { min: 10, max: 20 }) as Ref & {
      scales: { indicator?: { min: number; max: number; options: Record<string, number> } };
    };
    ref.scales.indicator = { min: 0, max: 0, options: {} };
    service.syncIndicatorAxis(asRef(ref));
    expect(ref.scales.indicator).toMatchObject({ min: 10, max: 20, options: { min: 10, max: 20 } });
  });

  it('merges capital-flow tier filter patches', () => {
    service.setCapitalFlowFilter({ gold: false });
    expect(service.capitalFlowFilter).toEqual({ bronze: true, silver: true, gold: false, platinum: true });
    service.setCapitalFlowFilter({ gold: true });
  });

  describe('crosshair (TradingView panes)', () => {
    // x 40_000..60_000 over 800px: 25 ms per px, a candle every 40px.
    const withPixelMapping = (ref: Ref) => {
      const x = ref.scales.x as Ref['scales']['x'] & Record<string, unknown>;
      x['getPixelForValue'] = (v: number) => ((v - x.min) / (x.max - x.min)) * 800;
      x['getValueForPixel'] = (px: number) => x.min + (px / 800) * (x.max - x.min);
      return ref as Ref & { _crosshairX?: number | null; _crosshairY?: number | null };
    };
    const move = (clientX: number, clientY: number) => ({ clientX, clientY }) as MouseEvent;

    beforeEach(() => {
      service.hoverCrosshair = true;
      service.onCrosshairChanged = undefined;
      service.hideCrosshair(null);
    });

    afterEach(() => {
      service.hoverCrosshair = false;
      service.onCrosshairChanged = undefined;
    });

    it('follows the mouse, snapped to the nearest candle, and tells the linked panel', () => {
      const ref = withPixelMapping(chartRef());
      const linked = vi.fn();
      service.onCrosshairChanged = linked;
      service.onMouseMove(move(415, 300), asRef(ref)); // 50_375 -> candle 50_000
      expect(ref._crosshairX).toBeCloseTo(400);
      expect(ref._crosshairY).toBe(300);
      expect(linked).toHaveBeenLastCalledWith(50_000, 300);
    });

    it('keeps only the vertical line when the pointer is in the linked panel below', () => {
      const ref = withPixelMapping(chartRef());
      const linked = vi.fn();
      service.onCrosshairChanged = linked;
      expect(service.showCrosshairAt(asRef(ref), 421, 700)).toBe(true); // 50_525 -> 51_000
      expect(ref._crosshairX).toBeCloseTo(440);
      expect(ref._crosshairY).toBeNull();
      expect(linked).toHaveBeenLastCalledWith(51_000, 700);
    });

    it('ignores positions outside the plot without a linked panel', () => {
      const ref = withPixelMapping(chartRef());
      service.onMouseMove(move(400, 700), asRef(ref));
      expect(ref._crosshairX ?? null).toBeNull();
    });

    it('snaps past the last candle to empty candle slots', () => {
      const ref = withPixelMapping(chartRef(candles(), { min: 90_000, max: 110_000 }));
      service.onMouseMove(move(615, 10), asRef(ref)); // 105_375 -> slot 105_000
      expect(ref._crosshairX).toBeCloseTo(600);
    });

    it('hides here and in the linked panel when the mouse leaves', () => {
      const ref = withPixelMapping(chartRef());
      const linked = vi.fn();
      service.onCrosshairChanged = linked;
      service.onMouseMove(move(400, 300), asRef(ref));
      service.onMouseLeave(asRef(ref));
      expect(ref._crosshairX).toBeNull();
      expect(linked).toHaveBeenLastCalledWith(null, null);
    });
  });
});
