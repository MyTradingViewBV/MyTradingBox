/**
 * Range math of ChartInteractionService (pan / zoom / fit / overscroll) on a
 * plain chart stub. With isInteracting=false every update runs synchronously.
 */
import { TestBed } from '@angular/core/testing';
import { ChartInteractionService } from './chart-interaction.service';
import { ChartLinkedScaleService } from './chart-linked-scale.service';
import {
  MAX_BAR_SPACING,
  MAX_PRICE_ZOOM_OUT,
  MIN_PRICE_RANGE_EPSILON_REL,
  PRICE_AXIS_SCALE_SENSITIVITY,
  MIN_BAR_SPACING,
  TIME_AXIS_SCALE_SENSITIVITY,
  WHEEL_LINE_PX,
  WHEEL_MAX_DELTA_PX,
  WHEEL_PINCH_FACTOR,
  WHEEL_ZOOM_SENSITIVITY,
  DEFAULT_BAR_SPACING,
  Y_AUTO_MARGIN_BOTTOM,
  Y_AUTO_MARGIN_TOP,
} from '../scales/time-scale';

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

  });

  describe('wheel zoom (anchored at the pointer)', () => {
    const wheel = (deltaY: number, clientX = 400, extra: Partial<WheelEvent> = {}) =>
      ({
        deltaY, deltaMode: 0, clientX, clientY: 300, ctrlKey: false,
        preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra,
      }) as unknown as WheelEvent;
    const range = (r: Ref) => ({ min: r.scales.x.options.min!, max: r.scales.x.options.max! });
    const px = (time: number) => service.timeScale.projectedTimeToX(time);

    it('wheel up zooms in, wheel down zooms out, and the event is consumed', () => {
      const ref = chartRef();
      const up = wheel(-100, 200);
      service.onWheel(up, asRef(ref));
      expect(up.preventDefault).toHaveBeenCalled();
      expect(up.stopPropagation).toHaveBeenCalled();
      const inSpan = ref.scales.x.options.max! - ref.scales.x.options.min!;
      expect(inSpan).toBeLessThan(20_000);
      expect(inSpan).toBeCloseTo(20_000 / Math.exp(100 * WHEEL_ZOOM_SENSITIVITY), 3);
      service.onWheel(wheel(100, 200), asRef(ref));
      expect(ref.scales.x.options.max! - ref.scales.x.options.min!).toBeCloseTo(20_000, 3);
    });

    it('one mouse notch is about 10-12%', () => {
      const ref = chartRef();
      service.onWheel(wheel(-100), asRef(ref));
      const factor = 20_000 / (ref.scales.x.options.max! - ref.scales.x.options.min!);
      expect(factor).toBeGreaterThan(1.1);
      expect(factor).toBeLessThan(1.12);
    });

    it.each([0.05, 0.25, 0.5, 0.75, 0.95])('keeps the time under the pointer at %s of the plot', (frac) => {
      const ref = chartRef();
      const clientX = frac * 800;
      service.onWheel(wheel(-100, clientX), asRef(ref)); // first event syncs the TimeScale
      const anchorTime = 40_000 + (clientX / 800) * 20_000;
      const sequence = [...Array(10).fill(-100), ...Array(10).fill(100)];
      const before = service.timeScale.visibleTimeRange()!;
      for (const delta of sequence) {
        service.onWheel(wheel(delta, clientX), asRef(ref));
        expect(px(anchorTime)).toBeCloseTo(clientX, 6);
      }
      const after = service.timeScale.visibleTimeRange()!;
      expect(after.max - after.min).not.toBeCloseTo(before.max - before.min, 0);
    });

    it('the pointer y has no effect on the time anchor', () => {
      const a = chartRef();
      const b = chartRef();
      service.onWheel(wheel(-100, 300, { clientY: 20 }), asRef(a));
      const ra = range(a);
      service.onWheel(wheel(-100, 300, { clientY: 560 }), asRef(b));
      expect(range(b).min).toBeCloseTo(ra.min, 6);
      expect(range(b).max).toBeCloseTo(ra.max, 6);
    });

    it('line mode (deltaMode 1) and page mode give sane factors', () => {
      const spanAfter = (event: WheelEvent) => {
        const ref = chartRef();
        service.onWheel(event, asRef(ref));
        return 20_000 / (ref.scales.x.options.max! - ref.scales.x.options.min!);
      };
      const lines = spanAfter(wheel(-3, 400, { deltaMode: 1 }));
      expect(lines).toBeGreaterThan(1.03);
      expect(lines).toBeLessThan(1.15);
      const page = spanAfter(wheel(-1, 400, { deltaMode: 2 }));
      expect(page).toBeLessThan(Math.exp(WHEEL_MAX_DELTA_PX * WHEEL_ZOOM_SENSITIVITY) + 1e-9);
      expect(page).toBeGreaterThan(1.1);
    });

    it('a huge delta is clamped per event (no jump)', () => {
      const ref = chartRef();
      service.onWheel(wheel(-100_000), asRef(ref));
      const factor = 20_000 / (ref.scales.x.options.max! - ref.scales.x.options.min!);
      expect(factor).toBeLessThan(1.25);
    });

    it('ctrl+wheel (trackpad pinch) uses the same anchored zoom with its own scale', () => {
      const ref = chartRef();
      const clientX = 600;
      const anchorTime = 55_000;
      service.onWheel(wheel(-3, clientX, { ctrlKey: true }), asRef(ref));
      const factor = 20_000 / (ref.scales.x.options.max! - ref.scales.x.options.min!);
      expect(factor).toBeCloseTo(Math.exp(3 * WHEEL_PINCH_FACTOR * WHEEL_ZOOM_SENSITIVITY), 4);
      expect(px(anchorTime)).toBeCloseTo(clientX, 6);
      // a ctrl+mouse notch is clamped, not 10x
      const other = chartRef();
      service.onWheel(wheel(-100, 400, { ctrlKey: true }), asRef(other));
      expect(20_000 / (other.scales.x.options.max! - other.scales.x.options.min!)).toBeLessThan(1.2);
    });

    it('clamps at MAX_BAR_SPACING while the anchor holds, and never reverses direction', () => {
      const ref = chartRef();
      for (let i = 0; i < 80; i++) service.onWheel(wheel(-100, 200), asRef(ref));
      const ts = service.timeScale;
      expect(ts.barSpacingPx).toBeLessThanOrEqual(MAX_BAR_SPACING + 1e-6);
      const before = ref.scales.x.options.max! - ref.scales.x.options.min!;
      service.onWheel(wheel(-100, 200), asRef(ref));
      expect(ref.scales.x.options.max! - ref.scales.x.options.min!).toBeLessThanOrEqual(before + 1e-6);
    });

    it('stops at the data-range limits and the anchor yields', () => {
      const ref = chartRef();
      for (let i = 0; i < 100; i++) service.onWheel(wheel(100, 700), asRef(ref));
      const r = range(ref);
      expect(r.max - r.min).toBeLessThanOrEqual(97_020 + 1e-6);
      expect(r.min).toBeGreaterThanOrEqual(-10_000 - 1e-6);
      expect(r.max).toBeLessThanOrEqual(109_000 + 1e-6);
      // zoom in to the minimum candles
      for (let i = 0; i < 200; i++) service.onWheel(wheel(-100, 700), asRef(ref));
      const z = range(ref);
      expect(z.max - z.min).toBeGreaterThanOrEqual(9_900 - 1e-6);
    });

    it('the anchor yields at the overscroll edge', () => {
      const ref = chartRef(candles(), { min: 100_000, max: 112_000 });
      service.onWheel(wheel(100, 780), asRef(ref));
      expect(range(ref).max).toBeLessThanOrEqual(109_000 + 1e-6);
    });

    it('the MCB pane (pane-relative cursor x) drives the same shared range', () => {
      const linked = TestBed.inject(ChartLinkedScaleService);
      const ref = chartRef();
      const mcb = { ...chartRef([], { min: 0, max: 1 }), canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect, dataset: { linkedPanel: 'mcb' } } };
      linked.syncMcbFromRenderedMain(ref as never);
      const clientX = 200;
      const paneX = service.plotXAtClientX(asRef(mcb as unknown as Ref), clientX);
      for (const delta of [-100, -100, 100, -100]) {
        service.onWheel(wheel(delta, clientX), asRef(ref), paneX);
        const ts = service.timeScale;
        expect(ts.projectedTimeToX(45_000)).toBeCloseTo(clientX, 6);
        const pushed = linked.pushXRangeFromMain(ref as never)!;
        const pane = ts.timeRangeForPlot({ left: ts.plotLeft, right: ts.plotRight })!;
        expect(pushed.xMin).toBeCloseTo(ref.scales.x.min, 6);
        expect(pushed.xMax).toBeCloseTo(ref.scales.x.max, 6);
        expect(pane.min).toBe(ref.scales.x.min);
        expect(pane.max).toBe(ref.scales.x.max);
      }
    });

    it('re-fits the y range to the visible candles when auto scale is on, not when manual', () => {
      const auto = chartRef(candles(), undefined, { min: 0, max: 300 });
      service.yAutoScale = true;
      service.onWheel(wheel(-100, 400), asRef(auto));
      expect(auto.scales.y.options.min).toBeDefined();

      const manual = chartRef(candles(), undefined, { min: 0, max: 300 });
      service.yAutoScale = false;
      service.onWheel(wheel(-100, 400), asRef(manual));
      expect(manual.scales.y.options.min).toBeUndefined();
    });

    it('is ignored while the touch crosshair is pinned', () => {
      const ref = chartRef();
      service.pinCrosshair();
      service.onWheel(wheel(-100), asRef(ref));
      expect(ref.scales.x.options).toEqual({});
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

  describe('anchored price-axis scale (T6)', () => {
    const mouse = (x: number, y: number, button = 0) =>
      ({ button, clientX: x, clientY: y }) as MouseEvent;
    const AXIS_X = 850; // right of the plot (0..800) = price-axis region; plot is 0..600 tall
    const docMove = (y: number, x = AXIS_X) =>
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
    const docUp = () => document.dispatchEvent(new MouseEvent('mouseup'));
    const yRange = (r: Ref) => ({ min: r.scales.y.options.min!, max: r.scales.y.options.max! });
    const span = (r: Ref) => r.scales.y.options.max! - r.scales.y.options.min!;
    const priceToY = (r: Ref, price: number) => ((r.scales.y.options.max! - price) / span(r)) * 600;

    afterEach(() => docUp());

    it('keeps the price under the press at the press y (10% / 50% / 90%, both directions)', () => {
      for (const startY of [60, 300, 540]) {
        const ref = chartRef(candles(), undefined, { min: 100, max: 200 });
        const anchor = 200 - (startY / 600) * 100;
        service.onMouseDown(mouse(AXIS_X, startY), asRef(ref));
        service.isInteracting = false;
        for (const dy of [10, 40, 120, 300, 100, 0, -40, -150, -400, -80]) {
          docMove(startY + dy);
          expect(priceToY(ref, anchor)).toBeCloseTo(startY, 6);
          expect(span(ref)).toBeGreaterThan(0);
        }
        service.onMouseUp(mouse(AXIS_X, startY), asRef(ref));
      }
    });

    it('drag up stretches (smaller span), drag down compresses (larger span)', () => {
      const ref = chartRef(candles(), undefined, { min: 100, max: 200 });
      service.onMouseDown(mouse(AXIS_X, 300), asRef(ref));
      service.isInteracting = false;
      docMove(200);
      expect(span(ref)).toBeCloseTo(100 * Math.exp(-100 * PRICE_AXIS_SCALE_SENSITIVITY));
      expect(span(ref)).toBeLessThan(100);
      docMove(400);
      expect(span(ref)).toBeCloseTo(100 * Math.exp(100 * PRICE_AXIS_SCALE_SENSITIVITY));
      expect(span(ref)).toBeGreaterThan(100);
    });

    it('a click without movement keeps auto scale and the range', () => {
      const ref = chartRef(candles(), undefined, { min: 100, max: 200 });
      service.onMouseDown(mouse(AXIS_X, 300), asRef(ref));
      service.onMouseMove(mouse(AXIS_X, 300), asRef(ref));
      docMove(300);
      service.onMouseUp(mouse(AXIS_X, 300), asRef(ref));
      expect(service.yAutoScale).toBe(true);
      expect(ref.scales.y.options).toEqual({});
    });

    it('a stale price-axis drag is replaced by a new time-axis press (old listeners detached)', () => {
      const ref = chartRef(candles(), undefined, { min: 100, max: 200 });
      service.onMouseDown(mouse(AXIS_X, 300), asRef(ref)); // release lost: no mouseup
      expect(service.isPriceAxisScaling).toBe(true);
      service.onMouseDown(mouse(400, 650), asRef(ref)); // time axis
      expect(service.isPriceAxisScaling).toBe(false);
      expect(service.isTimeAxisScaling).toBe(true);
      expect(service.gestureType).toBe('zoom-x');
      docMove(500, 400);
      // only the time-axis drag ran: y was auto-fitted by the time zoom, not scaled by the stale price drag
      expect(ref.scales.y.options.max! - ref.scales.y.options.min!).toBeLessThan(100);
      expect(service.yAutoScale).toBe(true);
    });

    it('stays auto on press, leaves auto scale on the first movement, stays manual after release and through a viewport round-trip', () => {
      const ref = chartRef(candles(), undefined, { min: 100, max: 200 });
      expect(service.yAutoScale).toBe(true);
      service.onMouseDown(mouse(AXIS_X, 300), asRef(ref));
      expect(service.yAutoScale).toBe(true);
      service.isInteracting = false;
      docMove(350);
      expect(service.yAutoScale).toBe(false);
      docUp();
      expect(service.gestureType).toBeNull();
      expect(service.yAutoScale).toBe(false);
      // storeViewportInOptions mirrors y.options.min/max into chartOptions; a rebind reads them back
      const stored = yRange(ref);
      const rebound = chartRef(candles(), undefined, { min: stored.min, max: stored.max });
      rebound.scales.y.options = { ...stored };
      expect(yRange(rebound)).toEqual(stored);
      // non-forced fits (time zoom, indicator refresh, data refresh) leave the manual range alone
      service.zoomHorizontal(1.1, asRef(ref));
      service.autoFitYScale(asRef(ref));
      expect(yRange(ref)).toEqual(stored);
      expect(service.yAutoScale).toBe(false);
    });

    it('stays finite and valid at ~1e5, ~1e-6 and with a start span at the minimum', () => {
      const cases: Array<[number, number]> = [[99_990, 100_010], [0.00000123, 0.0000013], [100_000, 100_000.1], [5, 5 + 1e-5]];
      for (const [min, max] of cases) {
        for (const dy of [-5000, -300, -1, 1, 300, 5000]) {
          for (const startY of [0, 150, 300, 600]) {
            const ref = chartRef(candles(), undefined, { min, max });
            service.onMouseDown(mouse(AXIS_X, startY), asRef(ref));
            service.isInteracting = false;
            const anchor = max - (startY / 600) * (max - min);
            docMove(startY + dy);
            const r = yRange(ref);
            expect(Number.isFinite(r.min) && Number.isFinite(r.max)).toBe(true);
            expect(r.max).toBeGreaterThan(r.min);
            const s = r.max - r.min;
            expect(s).toBeLessThanOrEqual((max - min) * 1e3 * (1 + 1e-9));
            expect(s).toBeGreaterThanOrEqual(Math.min(max - min, 1e-6 * anchor) * (1 - 1e-6));
            // the anchor holds, up to float rounding at the price magnitude
            expect(Math.abs(priceToY(ref, anchor) - startY)).toBeLessThan(1e-3 + ((1e-12 * Math.abs(anchor)) / s) * 600);
            service.onMouseUp(mouse(AXIS_X, startY), asRef(ref));
          }
        }
      }
    });

    it('clamps the span at the minimum (anchor still solved) and at the maximum zoom-out', () => {
      const ref = chartRef(candles(), undefined, { min: 100, max: 200 });
      service.onMouseDown(mouse(AXIS_X, 150), asRef(ref)); // anchor 175 at 25%
      service.isInteracting = false;
      docMove(150 - 20_000);
      expect(span(ref)).toBeCloseTo(175 * MIN_PRICE_RANGE_EPSILON_REL, 12);
      expect(priceToY(ref, 175)).toBeCloseTo(150, 3);
      docMove(150 + 20_000);
      expect(span(ref)).toBeCloseTo(100 * MAX_PRICE_ZOOM_OUT, 6);
      expect(priceToY(ref, 175)).toBeCloseTo(150, 6);
    });

    it('computes from the start state: the same total dy gives the same range whatever the path', () => {
      const run = (path: number[]) => {
        const ref = chartRef(candles(), undefined, { min: 100, max: 200 });
        service.onMouseDown(mouse(AXIS_X, 200), asRef(ref));
        service.isInteracting = false;
        for (const y of path) docMove(y);
        const r = yRange(ref);
        service.onMouseUp(mouse(AXIS_X, 200), asRef(ref));
        return r;
      };
      const direct = run([330]);
      expect(run([210, 500, 100, 330])).toEqual(direct);
      expect(run([0, 600, 330, 331, 330])).toEqual(direct);
      // back at the press y: exactly the start range
      expect(run([400, 50, 200])).toEqual({ min: 100, max: 200 });
    });

    it('does not touch the X range during y scaling', () => {
      const ref = chartRef(candles(), undefined, { min: 100, max: 200 });
      service.onMouseDown(mouse(AXIS_X, 300), asRef(ref));
      service.isInteracting = false;
      docMove(380);
      docMove(120);
      service.onMouseUp(mouse(AXIS_X, 120), asRef(ref));
      expect(ref.scales.x.options).toEqual({});
      expect(ref.scales.x.min).toBe(40_000);
      expect(ref.scales.x.max).toBe(60_000);
    });

    it('does not touch the MCB value scale', () => {
      const ref = chartRef(candles(), undefined, { min: 100, max: 200 });
      const mcb = { min: -60, max: 60, options: { min: -60, max: 60 } };
      (ref.scales as Record<string, unknown>)['mcb'] = mcb;
      service.onMouseDown(mouse(AXIS_X, 300), asRef(ref));
      service.isInteracting = false;
      docMove(400);
      service.onMouseUp(mouse(AXIS_X, 400), asRef(ref));
      expect(mcb).toEqual({ min: -60, max: 60, options: { min: -60, max: 60 } });
    });

    it('continues outside the chart and ends on release anywhere, removing the listeners', () => {
      const ref = chartRef(candles(), undefined, { min: 100, max: 200 });
      const removed = vi.spyOn(document, 'removeEventListener');
      service.onMouseDown(mouse(AXIS_X, 300), asRef(ref));
      expect(service.isPriceAxisScaling).toBe(true);
      service.isInteracting = false;
      docMove(5000, 5000); // far outside the chart
      expect(span(ref)).toBeGreaterThan(100);
      docUp();
      expect(service.isPriceAxisScaling).toBe(false);
      expect(service.gestureType).toBeNull();
      expect(service.isInteracting).toBe(false);
      expect(removed).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(removed).toHaveBeenCalledWith('mouseup', expect.any(Function));
      const after = yRange(ref);
      docMove(0);
      expect(yRange(ref)).toEqual(after);
      removed.mockRestore();
    });

    it('window blur ends the drag, and destroy mid-drag drops the listeners', () => {
      const ref = chartRef(candles(), undefined, { min: 100, max: 200 });
      service.onMouseDown(mouse(AXIS_X, 300), asRef(ref));
      window.dispatchEvent(new Event('blur'));
      expect(service.isPriceAxisScaling).toBe(false);
      expect(service.gestureType).toBeNull();
      const ref2 = chartRef(candles(), undefined, { min: 100, max: 200 });
      service.onMouseDown(mouse(AXIS_X, 300), asRef(ref2));
      service.isInteracting = false;
      service.ngOnDestroy();
      docMove(500);
      expect(ref2.scales.y.options).toEqual({});
    });

    it('a canvas move that also reaches the document is applied once', () => {
      const ref = chartRef(candles(), undefined, { min: 100, max: 200 });
      service.onMouseDown(mouse(AXIS_X, 300), asRef(ref));
      service.isInteracting = false;
      const sync = vi.spyOn(service, 'syncIndicatorAxis');
      service.onMouseMove(mouse(AXIS_X, 360), asRef(ref));
      docMove(360);
      expect(sync).toHaveBeenCalledTimes(1);
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

    it('scales instead of panning (container move defers to the document listener)', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, AXIS_Y), asRef(ref));
      service.isInteracting = false;
      service.onMouseMove(mouse(480, AXIS_Y), asRef(ref));
      docMove(480);
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

    it('ending the drag on an already destroyed chart still cleans up (update throws, no canvas)', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, AXIS_Y), asRef(ref));
      ref.update.mockImplementation(() => {
        throw new Error('chart destroyed');
      });
      expect(() => service.endTimeAxisScale(asRef(ref))).not.toThrow();
      expect(service.isTimeAxisScaling).toBe(false);
      expect(service.gestureType).toBeNull();
      expect(service.isInteracting).toBe(false);
      const before = { ...range(ref) };
      docMove(700); // document listeners are gone
      expect(range(ref)).toEqual(before);

      service.onMouseDown(mouse(400, AXIS_Y), asRef(ref));
      (ref as { canvas: unknown }).canvas = null;
      expect(() => service.endTimeAxisScale(asRef(ref))).not.toThrow();
      expect(service.isTimeAxisScaling).toBe(false);
    });

    it('scales once per mouse move while the document listener is capturing', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, AXIS_Y), asRef(ref));
      service.isInteracting = false;
      const spy = vi.spyOn(service, 'updateTimeAxisScale');
      service.onMouseMove(mouse(440, AXIS_Y), asRef(ref));
      expect(spy).not.toHaveBeenCalled();
      docMove(440);
      expect(spy).toHaveBeenCalledTimes(1);
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
      expect(ts.barSpacingPx).toBeCloseTo(40 * Math.exp(30 * TIME_AXIS_SCALE_SENSITIVITY), 6);
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

  describe('two-pointer pinch (focal anchor)', () => {
    const t = (...pts: Array<[number, number]>) =>
      ({ touches: pts.map(([clientX, clientY]) => ({ clientX, clientY })), preventDefault: vi.fn() }) as unknown as TouchEvent;
    /** Two fingers `d` apart, centered on (cx, 300). */
    const two = (cx: number, d: number) => t([cx - d / 2, 300], [cx + d / 2, 300]);
    const range = (r: Ref) => ({ min: r.scales.x.options.min!, max: r.scales.x.options.max! });
    const px = (time: number) => service.timeScale.projectedTimeToX(time);
    const timeAt = (x: number) => 40_000 + (x / 800) * 20_000;
    const end = (ref: Ref, remaining: Array<[number, number]> = []) =>
      service.onTouchEnd(t(...remaining), asRef(ref));

    it.each([0.25, 0.5, 0.75])('keeps the anchor time under the centroid at %s of the plot (spread and contract)', (frac) => {
      const ref = chartRef();
      const cx = frac * 800;
      service.onTouchStart(t([cx, 300]), asRef(ref));
      service.onTouchStart(two(cx, 100), asRef(ref));
      expect(service.gestureType).toBe('pinch');
      const anchor = timeAt(cx);
      for (const d of [110, 130, 160, 140, 120, 90, 70, 50]) {
        service.onTouchMove(two(cx, d), asRef(ref));
        expect(px(anchor)).toBeCloseTo(cx, 6);
        expect(service.timeScale.barSpacingPx).toBeCloseTo(40 * (d / 100), 6);
      }
      expect(service.gestureType).toBe('pinch');
    });

    it('moving the centroid translates the view continuously (the anchor follows the centroid)', () => {
      const ref = chartRef();
      service.onTouchStart(t([400, 300]), asRef(ref));
      service.onTouchStart(two(400, 100), asRef(ref));
      const anchor = timeAt(400);
      // pure translation at constant distance: span unchanged, the view moves by the centroid shift
      service.onTouchMove(two(500, 100), asRef(ref));
      let r = range(ref);
      expect(r.max - r.min).toBeCloseTo(20_000, 6);
      expect(r.min).toBeCloseTo(40_000 - 100 / 0.04, 6);
      let prev = r.min;
      for (const [cx, d] of [[520, 120], [470, 150], [300, 90], [350, 140]] as const) {
        service.onTouchMove(two(cx, d), asRef(ref));
        expect(px(anchor)).toBeCloseTo(cx, 6);
        r = range(ref);
        expect(r.min).not.toBe(prev);
        prev = r.min;
      }
    });

    it('does not jump when the second finger lands, nor when one lifts', () => {
      const ref = chartRef();
      service.onTouchStart(t([400, 300]), asRef(ref));
      service.onTouchStart(two(400, 100), asRef(ref));
      service.onTouchMove(two(400, 100), asRef(ref));
      expect(range(ref).min).toBeCloseTo(40_000, 6);
      expect(range(ref).max).toBeCloseTo(60_000, 6);
      service.onTouchMove(two(400, 200), asRef(ref));
      const zoomed = { ...range(ref) };

      // one finger lifts: nothing changes, the remaining finger is a fresh pan start
      end(ref, [[500, 300]]);
      expect(range(ref)).toEqual(zoomed);
      expect(service.gestureType).toBeNull();
      expect(service.isInteracting).toBe(true);
      service.onTouchMove(t([505, 300]), asRef(ref)); // under the pan threshold: still
      expect(range(ref)).toEqual(zoomed);
      service.onTouchMove(t([530, 300]), asRef(ref)); // pans by exactly the finger travel from the rebase (30px)
      expect(service.gestureType).toBe('pan');
      const panned = range(ref);
      const span = zoomed.max - zoomed.min;
      expect(panned.max - panned.min).toBeCloseTo(span, 6);
      expect(panned.min).toBeCloseTo(zoomed.min - (30 / service.timeScale.plotWidth) * span, 3);

      // last finger up: ends cleanly, and is never a tap
      expect(end(ref)).toBeNull();
      expect(service.isInteracting).toBe(false);
      expect(service.gestureType).toBeNull();
    });

    it('takes over from pan, long-press and time-axis scaling (one gesture only)', () => {
      vi.useFakeTimers();
      try {
        const ref = chartRef();
        // long-press timer is cancelled by the second finger
        service.onTouchStart(t([400, 300]), asRef(ref));
        expect(vi.getTimerCount()).toBe(1);
        service.onTouchStart(two(400, 100), asRef(ref));
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(500);
        expect(service.isCrosshairPinned).toBe(false);
        end(ref);

        // a running one-finger pan: the pinch replaces it, one-finger moves no longer pan
        service.onTouchStart(t([400, 300]), asRef(ref));
        service.onTouchMove(t([440, 300]), asRef(ref));
        expect(service.gestureType).toBe('pan');
        service.onTouchStart(two(440, 100), asRef(ref));
        expect(service.gestureType).toBe('pinch');
        const before = { ...range(ref) };
        service.onTouchMove(t([480, 300]), asRef(ref)); // stray single-touch move: ignored
        expect(range(ref)).toEqual(before);
        service.onTouchMove(two(440, 200), asRef(ref));
        expect(range(ref)).not.toEqual(before);
        end(ref);

        // a time-axis scale in progress is dropped
        service.onTouchStart(t([200, 650]), asRef(ref));
        service.onTouchMove(t([240, 650]), asRef(ref));
        expect(service.isTimeAxisScaling).toBe(true);
        service.onTouchStart(two(300, 100), asRef(ref));
        expect(service.isTimeAxisScaling).toBe(false);
        expect(service.gestureType).toBe('pinch');
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not start while the touch crosshair is pinned', () => {
      const ref = chartRef();
      service.pinCrosshair();
      service.onTouchStart(t([400, 300]), asRef(ref));
      service.onTouchStart(two(400, 100), asRef(ref));
      service.onTouchMove(two(400, 300), asRef(ref));
      expect(service.gestureType).toBeNull();
      expect(ref.scales.x.options).toEqual({});
    });

    it('clamps to MIN/MAX_BAR_SPACING and the data range, holding the anchor until the limit', () => {
      const ref = chartRef();
      service.onTouchStart(t([200, 300]), asRef(ref));
      service.onTouchStart(two(200, 40), asRef(ref));
      service.onTouchMove(two(200, 40_000), asRef(ref));
      expect(service.timeScale.barSpacingPx).toBeLessThanOrEqual(MAX_BAR_SPACING + 1e-6);
      expect(px(timeAt(200))).toBeCloseTo(200, 3);
      service.onTouchMove(two(200, 0.001), asRef(ref));
      const r = range(ref);
      expect(service.timeScale.barSpacingPx).toBeGreaterThanOrEqual(MIN_BAR_SPACING - 1e-6);
      expect(r.max - r.min).toBeLessThanOrEqual(97_020 + 1e-6);
      expect(r.min).toBeGreaterThanOrEqual(-10_000 - 1e-6);
      expect(r.max).toBeLessThanOrEqual(109_000 + 1e-6);
      // back to the start distance: computed from the start state, so the start view returns
      service.onTouchMove(two(200, 40), asRef(ref));
      expect(px(timeAt(200))).toBeCloseTo(200, 3);
      expect(service.timeScale.barSpacingPx).toBeCloseTo(40, 6);
    });

    it('ignores identical touch points and NaN / zero distances', () => {
      const ref = chartRef();
      service.onTouchStart(t([400, 300]), asRef(ref));
      service.onTouchStart(t([400, 300], [400, 300]), asRef(ref)); // distance 0: no pinch
      expect(service.isPinching).toBe(false);
      service.onTouchMove(two(400, 200), asRef(ref));
      expect(ref.scales.x.options).toEqual({});

      end(ref);
      service.onTouchStart(t([400, 300]), asRef(ref));
      service.onTouchStart(two(400, 100), asRef(ref));
      service.onTouchMove(two(400, 150), asRef(ref));
      const before = { ...range(ref) };
      service.onTouchMove(t([400, 300], [400, 300]), asRef(ref));
      service.onTouchMove(t([Number.NaN, 300], [400, 300]), asRef(ref));
      expect(service.updatePinch(0, 400)).toBe(false);
      expect(service.updatePinch(Number.NaN, 400)).toBe(false);
      expect(service.updatePinch(100, Number.NaN)).toBe(false);
      expect(range(ref)).toEqual(before);
    });

    it('only changes the horizontal scale and re-fits y through the shared path', () => {
      const auto = chartRef(candles(), undefined, { min: 0, max: 300 });
      service.yAutoScale = true;
      service.onTouchStart(t([400, 300]), asRef(auto));
      service.onTouchStart(two(400, 100), asRef(auto));
      service.onTouchMove(two(400, 160), asRef(auto));
      expect(auto.scales.y.options.min).toBeDefined();
      expect(service.yAutoScale).toBe(true);
      end(auto);

      const manual = chartRef(candles(), undefined, { min: 0, max: 300 });
      service.yAutoScale = false;
      service.onTouchStart(t([400, 300]), asRef(manual));
      service.onTouchStart(two(400, 100), asRef(manual));
      service.onTouchMove(two(400, 160), asRef(manual));
      expect(manual.scales.y.options.min).toBeUndefined();
      expect(manual.scales.y.options.max).toBeUndefined();
    });

    it('the MCB pane (pane-relative centroid) drives the same shared range', () => {
      const linked = TestBed.inject(ChartLinkedScaleService);
      const ref = chartRef();
      linked.syncMcbFromRenderedMain(ref as never);
      const internals = linked as unknown as { mcbPlotDelta: { left: number; right: number } };
      internals.mcbPlotDelta = { left: 3, right: -3 };
      // pane x 197 = main x 200 (the MCB plot starts 3px right of the main plot)
      expect(service.mainPlotXFromMcbPane(197)).toBe(200);
      expect(service.beginPinch(asRef(ref), 100, service.mainPlotXFromMcbPane(197))).toBe(true);
      const anchor = timeAt(200);
      for (const [paneX, d] of [[197, 150], [247, 90], [150, 210]] as const) {
        expect(service.updatePinch(d, service.mainPlotXFromMcbPane(paneX))).toBe(true);
        const ts = service.timeScale;
        expect(ts.projectedTimeToX(anchor)).toBeCloseTo(paneX + 3, 6);
        // the pane shows the TimeScale range for its own plot edges (3px inside the main plot here)
        const pushed = linked.pushXRangeFromMain(ref as never)!;
        expect(pushed.xMin).toBeCloseTo(ts.projectedXToTime(ts.plotLeft + 3), 6);
        expect(pushed.xMax).toBeCloseTo(ts.projectedXToTime(ts.plotRight - 3), 6);
      }
      service.endPinch(asRef(ref));
      expect(service.isPinching).toBe(false);
      expect(service.isInteracting).toBe(false);
      internals.mcbPlotDelta = { left: 0, right: 0 };
    });
  });

  describe('uneven candles: gestures compute from the start state', () => {
    // every 7th gap is 5x longer: span x index-based spacing depends on the visible candles
    const uneven = (() => {
      let x = 0;
      return Array.from({ length: 100 }, (_, i) => {
        if (i > 0) x += i % 7 === 0 ? 5 * STEP : STEP;
        return { x, h: 110 + i, l: 90 + i };
      });
    })();
    const last = uneven[uneven.length - 1].x;
    const setup = () => {
      service.setRanges({ min: 0, max: last }, { min: -10_000, max: last + 10_000 }, { min: 90, max: 209 });
      return chartRef(uneven, { min: 20_000, max: 70_000 });
    };
    const range = (r: Ref) => ({ min: r.scales.x.options.min!, max: r.scales.x.options.max! });
    const t = (...pts: Array<[number, number]>) =>
      ({ touches: pts.map(([clientX, clientY]) => ({ clientX, clientY })), preventDefault: vi.fn() }) as unknown as TouchEvent;

    it('time-axis drag: identical updates give identical ranges', () => {
      const ref = setup();
      expect(service.beginTimeAxisScale(asRef(ref), 400)).toBe(true);
      service.updateTimeAxisScale(460, asRef(ref));
      const first = { ...range(ref) };
      for (let i = 0; i < 5; i++) {
        service.updateTimeAxisScale(460, asRef(ref));
        expect(range(ref)).toEqual(first);
      }
      service.endTimeAxisScale(asRef(ref));
    });

    it('pinch: identical updates give identical ranges, also while the centroid moves sideways', () => {
      const ref = setup();
      const two = (cx: number, d: number) => t([cx - d / 2, 300], [cx + d / 2, 300]);
      service.onTouchStart(t([400, 300]), asRef(ref));
      service.onTouchStart(two(400, 100), asRef(ref));
      service.onTouchMove(two(470, 100), asRef(ref));
      const first = { ...range(ref) };
      for (let i = 0; i < 5; i++) {
        service.onTouchMove(two(470, 100), asRef(ref));
        expect(range(ref)).toEqual(first);
      }
      // sideways at constant distance keeps the span
      service.onTouchMove(two(300, 100), asRef(ref));
      service.onTouchMove(two(550, 100), asRef(ref));
      const r = range(ref);
      expect(r.max - r.min).toBeCloseTo(first.max - first.min, 6);
    });
  });

  describe('pan from the start state (T5)', () => {
    const mouse = (x: number, y: number, button = 0) => ({ button, clientX: x, clientY: y }) as MouseEvent;
    const t1 = (x: number, y: number) =>
      ({ touches: [{ clientX: x, clientY: y }], preventDefault: vi.fn() }) as unknown as TouchEvent;
    const range = (r: Ref) => ({ min: r.scales.x.options.min!, max: r.scales.x.options.max! });
    const unevenCandles = (() => {
      let x = 0;
      return Array.from({ length: 100 }, (_, i) => {
        if (i > 0) x += i % 7 === 0 ? 5 * STEP : STEP;
        return { x, h: 110 + i, l: 90 + i };
      });
    })();
    const lastUneven = unevenCandles[unevenCandles.length - 1].x;
    const unevenRef = () => {
      service.setRanges({ min: 0, max: lastUneven }, { min: -10_000, max: lastUneven + 10_000 }, { min: 90, max: 209 });
      return chartRef(unevenCandles, { min: 20_000, max: 70_000 });
    };
    const drag = (ref: Ref, x0: number, xs: number[]) => {
      service.onMouseDown(mouse(x0, 300), asRef(ref));
      for (const x of xs) service.onMouseMove(mouse(x, 300), asRef(ref));
      service.onMouseUp(mouse(xs[xs.length - 1], 300), asRef(ref));
    };

    it('keeps the range span and bar spacing (uneven candles keep the span)', () => {
      const even = chartRef();
      service.onMouseDown(mouse(400, 300), asRef(even));
      service.onMouseMove(mouse(401, 300), asRef(even)); // syncs the TimeScale
      const spacing = service.timeScale.barSpacingPx;
      for (const x of [430, 520, 380, 700, 90]) {
        service.onMouseMove(mouse(x, 300), asRef(even));
        const r = range(even);
        expect(r.max - r.min).toBeCloseTo(20_000, 6);
        expect(service.timeScale.barSpacingPx).toBeCloseTo(spacing, 6);
      }
      service.onMouseUp(mouse(90, 300), asRef(even));

      const ref = unevenRef();
      service.onMouseDown(mouse(400, 300), asRef(ref));
      for (const x of [430, 520, 380, 700, 90]) {
        service.onMouseMove(mouse(x, 300), asRef(ref));
        const r = range(ref);
        expect(r.max - r.min).toBeCloseTo(50_000, 6);
      }
      service.onMouseUp(mouse(90, 300), asRef(ref));
    });

    it('identical total dx gives an identical range whatever the moves in between (uneven candles)', () => {
      const direct = unevenRef();
      drag(direct, 400, [470]);
      const winding = unevenRef();
      drag(winding, 400, [405, 250, 600, 433, 470]);
      expect(range(winding)).toEqual(range(direct));

      const touchA = unevenRef();
      service.onTouchStart(t1(400, 300), asRef(touchA));
      service.onTouchMove(t1(470, 300), asRef(touchA));
      service.onTouchEnd({ touches: [] } as unknown as TouchEvent, asRef(touchA));
      const touchB = unevenRef();
      service.onTouchStart(t1(400, 300), asRef(touchB));
      for (const x of [415, 480, 300, 470]) service.onTouchMove(t1(x, 300), asRef(touchB));
      service.onTouchEnd({ touches: [] } as unknown as TouchEvent, asRef(touchB));
      expect(range(touchB)).toEqual(range(touchA));
      expect(range(touchA).max - range(touchA).min).toBeCloseTo(50_000, 6);
    });

    it('drag right shows older data, drag left newer data', () => {
      const ref = chartRef();
      drag(ref, 400, [480]);
      expect(range(ref).min).toBeLessThan(40_000);
      const ref2 = chartRef();
      drag(ref2, 400, [320]);
      expect(range(ref2).min).toBeGreaterThan(40_000);
      expect(range(ref2)).toEqual({ min: 42_000, max: 62_000 });
    });

    it('reversing after the clamp engaged keeps the range until the pointer passes the clamp start, then returns to the start range', () => {
      const ref = chartRef(candles(), { min: 90_000, max: 100_000 });
      // 800px over a 10000 span = 12.5 time units per px; the right clamp (109000) engages at dx = -720
      service.onMouseDown(mouse(400, 300), asRef(ref));
      const at = (x: number) => {
        service.onMouseMove(mouse(x, 300), asRef(ref));
        return range(ref);
      };
      expect(at(400 - 500)).toEqual({ min: 96_250, max: 106_250 });
      expect(at(400 - 900)).toEqual({ min: 99_000, max: 109_000 });
      expect(at(400 - 1200)).toEqual({ min: 99_000, max: 109_000 });
      // reversing: still clamped until dx passes -720 again (an incremental pan would already move)
      expect(at(400 - 1000)).toEqual({ min: 99_000, max: 109_000 });
      expect(at(400 - 800)).toEqual({ min: 99_000, max: 109_000 });
      expect(at(400 - 720)).toEqual({ min: 99_000, max: 109_000 });
      expect(at(400 - 600)).toEqual({ min: 97_500, max: 107_500 });
      expect(at(400)).toEqual({ min: 90_000, max: 100_000 });
      service.onMouseUp(mouse(400, 300), asRef(ref));
    });

    it('clamps at the extended data range on both sides, keeping the span', () => {
      const ref = chartRef(candles(), { min: 0, max: 20_000 });
      drag(ref, 0, [800, 800]);
      expect(range(ref)).toEqual({ min: -10_000, max: 10_000 });
      const ref2 = chartRef(candles(), { min: 90_000, max: 100_000 });
      drag(ref2, 800, [0]);
      expect(range(ref2)).toEqual({ min: 99_000, max: 109_000 });
    });

    it('keeps the y span and the y auto-scale mode; y pans by dy (existing behaviour)', () => {
      const ref = chartRef();
      service.yAutoScale = true;
      service.onMouseDown(mouse(400, 300), asRef(ref));
      service.onMouseMove(mouse(480, 360), asRef(ref));
      expect(service.yAutoScale).toBe(true);
      // 60px of 600px = 10% of the 300 y-range
      expect(ref.scales.y.options).toEqual({ min: 30, max: 330 });
      service.onMouseUp(mouse(480, 360), asRef(ref));
      service.yAutoScale = false;
      const manual = chartRef();
      drag(manual, 400, [500]);
      expect(service.yAutoScale).toBe(false);
      expect(manual.scales.y.options.max! - manual.scales.y.options.min!).toBeCloseTo(300, 9);
      service.yAutoScale = true;
    });

    it('main and MCB pane show identical ranges, from either pane', () => {
      const linked = TestBed.inject(ChartLinkedScaleService);
      const internals = linked as unknown as { mcbPlotDelta: { left: number; right: number } };
      const expectPaneInSync = (ref: Ref) => {
        const ts = service.timeScale;
        const r = range(ref);
        expect(r.min).toBeCloseTo(ts.visibleTimeRange()!.min, 6);
        expect(r.max).toBeCloseTo(ts.visibleTimeRange()!.max, 6);
        const pushed = linked.pushXRangeFromMain(ref as never)!;
        expect(pushed.xMin).toBeCloseTo(ts.projectedXToTime(ts.plotLeft + 3), 6);
        expect(pushed.xMax).toBeCloseTo(ts.projectedXToTime(ts.plotRight - 3), 6);
      };
      const mainRef = unevenRef();
      linked.syncMcbFromRenderedMain(mainRef as never);
      internals.mcbPlotDelta = { left: 3, right: -3 };
      drag(mainRef, 400, [450, 520]);
      expectPaneInSync(mainRef);

      const paneRef = unevenRef();
      linked.syncMcbFromRenderedMain(paneRef as never);
      internals.mcbPlotDelta = { left: 3, right: -3 };
      // the pane pointer sits 3px off the main plot: only dx counts
      service.beginLinkedPan(asRef(paneRef), 403);
      service.linkedPanTo(453, asRef(paneRef));
      service.linkedPanTo(523, asRef(paneRef));
      expectPaneInSync(paneRef);
      expect(range(paneRef).min).toBeCloseTo(range(mainRef).min, 6);
      expect(range(paneRef).max).toBeCloseTo(range(mainRef).max, 6);
      service.endLinkedPan(asRef(paneRef));
      expect(service.gestureType).toBeNull();
      internals.mcbPlotDelta = { left: 0, right: 0 };
    });

    it('liveFollowState: detaches when panned away, follows again when panned back; zoom does not change it', () => {
      const wheel = (deltaY: number) =>
        ({ deltaY, deltaMode: 0, clientX: 400, clientY: 300, ctrlKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as WheelEvent;
      // live edge: last candle 99000 + 3 padding bars -> right edge 102000
      const ref = chartRef(candles(), { min: 80_000, max: 102_000 });
      expect(service.liveFollowState).toBe('following');
      service.onMouseDown(mouse(400, 300), asRef(ref));
      service.onMouseMove(mouse(200, 300), asRef(ref)); // right edge 5.5 bars past the live edge
      expect(service.liveFollowState).toBe('detached');
      service.onMouseMove(mouse(395, 300), asRef(ref)); // 0.275 bars from the live edge
      expect(service.liveFollowState).toBe('following');
      service.onMouseMove(mouse(0, 300), asRef(ref));
      expect(service.liveFollowState).toBe('detached');
      service.onMouseUp(mouse(0, 300), asRef(ref));

      // wheel / time-axis zoom leave it as is, whatever the right edge does
      service.onWheel(wheel(-200), asRef(ref));
      expect(service.liveFollowState).toBe('detached');
      const back = chartRef(candles(), { min: 80_000, max: 102_000 });
      drag(back, 400, [405]);
      expect(service.liveFollowState).toBe('following');
      service.onWheel(wheel(-200), asRef(back));
      service.beginTimeAxisScale(asRef(back), 400);
      service.updateTimeAxisScale(100, asRef(back));
      service.endTimeAxisScale(asRef(back));
      expect(service.liveFollowState).toBe('following');
    });

    it('a release outside the chart ends the pan and cleans up the document listeners', () => {
      const ref = chartRef();
      const ended = vi.fn();
      service.onPanEnd = ended;
      const removed = vi.spyOn(document, 'removeEventListener');
      service.onMouseDown(mouse(400, 300), asRef(ref));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 480, clientY: 300 }));
      expect(range(ref)).toEqual({ min: 38_000, max: 58_000 });
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 900, clientY: 300 }));
      expect(service.gestureType).toBeNull();
      expect(service.isInteracting).toBe(false);
      expect(ended).toHaveBeenCalledTimes(1);
      expect(removed).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(removed).toHaveBeenCalledWith('mouseup', expect.any(Function));
      const after = range(ref);
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 300 }));
      expect(range(ref)).toEqual(after);

      // window blur ends it too
      service.onMouseDown(mouse(400, 300), asRef(ref));
      window.dispatchEvent(new Event('blur'));
      expect(service.gestureType).toBeNull();
      expect(ended).toHaveBeenCalledTimes(2);
      removed.mockRestore();
      service.onPanEnd = undefined;
    });

    it('a release on the chart does not fire the document end hook (no double end)', () => {
      const ref = chartRef();
      const ended = vi.fn();
      service.onPanEnd = ended;
      drag(ref, 400, [450]);
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 450, clientY: 300 }));
      expect(ended).not.toHaveBeenCalled();
      service.onPanEnd = undefined;
    });
  });

  describe('wheel carry-overs (T3 audit)', () => {
    const wheel = (deltaY: number, extra: Partial<WheelEvent> = {}) =>
      ({
        deltaY, deltaMode: 0, clientX: 400, clientY: 300, ctrlKey: false,
        preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra,
      }) as unknown as WheelEvent;
    const factorOf = (event: WheelEvent) => {
      const ref = chartRef();
      service.onWheel(event, asRef(ref));
      return 20_000 / (ref.scales.x.options.max! - ref.scales.x.options.min!);
    };

    it('a 3-line notch (deltaMode 1) is about a Chrome pixel notch', () => {
      const chrome = factorOf(wheel(-100));
      const firefox = factorOf(wheel(-3, { deltaMode: 1 }));
      expect(WHEEL_LINE_PX).toBe(32);
      expect(firefox).toBeCloseTo(chrome, 2);
    });

    it('reads deltaMode before deltaY', () => {
      const order: string[] = [];
      const event = {
        get deltaMode() { order.push('deltaMode'); return 1; },
        get deltaY() { order.push('deltaY'); return -3; },
        clientX: 400, clientY: 300, ctrlKey: false,
        preventDefault: vi.fn(), stopPropagation: vi.fn(),
      } as unknown as WheelEvent;
      service.onWheel(event, asRef(chartRef()));
      expect(order.indexOf('deltaMode')).toBeGreaterThanOrEqual(0);
      expect(order.indexOf('deltaMode')).toBeLessThan(order.indexOf('deltaY'));
    });

    it('an MCB pane without a chart yet (NaN x) anchors the wheel at the right edge', () => {
      const ref = chartRef();
      service.onWheel(wheel(-100), asRef(ref)); // syncs the TimeScale
      const rightTime = service.timeScale.projectedXToTime(service.timeScale.plotRight);
      const paneX = service.mainPlotXFromMcbPane(service.plotXAtClientX(null, 400));
      expect(paneX).toBe(service.timeScale.plotWidth);
      for (let i = 0; i < 5; i++) {
        service.onWheel(wheel(-100), asRef(ref), paneX);
        expect(service.timeScale.projectedTimeToX(rightTime)).toBeCloseTo(service.timeScale.plotRight, 6);
      }
    });
  });

  describe('double-click / double-tap resets (T7)', () => {
    // Plot 0..700 x 0..550 inside an 800x600 canvas: price axis right of 700, time axis below 550.
    const refWithAxes = (x = { min: 40_000, max: 60_000 }, y = { min: 0, max: 300 }) => {
      const ref = chartRef(candles(), x, y);
      ref.chartArea = { left: 0, right: 700, top: 0, bottom: 550 };
      return ref;
    };
    const mouse = (x: number, y: number) => ({ button: 0, clientX: x, clientY: y }) as MouseEvent;
    const centerTime = () => service.timeScale.projectedXToTime(service.timeScale.plotLeft + service.timeScale.plotWidth / 2);
    /** Pan away from the live edge so the service reports 'detached'. */
    const detach = (ref: Ref) => {
      service.onMouseDown(mouse(400, 300), asRef(ref));
      service.onMouseMove(mouse(380, 300), asRef(ref));
      service.onMouseUp(mouse(380, 300), asRef(ref));
      expect(service.liveFollowState).toBe('detached');
    };

    beforeEach(() => service.computeExtendedRange(candles()));

    it('(a) price-axis reset: auto on, fitted to the visible candles with the margins, manual range discarded', () => {
      const ref = refWithAxes({ min: 40_000, max: 60_000 }, { min: -500, max: 9_000 });
      service.yAutoScale = false;
      service.resetPriceScale(asRef(ref));
      expect(service.yAutoScale).toBe(true);
      // visible candles 40..60: lows 130..150, highs 150..170
      const span = 170 - 130;
      expect(ref.scales.y.options.min).toBeCloseTo(130 - span * Y_AUTO_MARGIN_BOTTOM);
      expect(ref.scales.y.options.max).toBeCloseTo(170 + span * Y_AUTO_MARGIN_TOP);
      expect(ref.scales.y.options.min).toBeCloseTo(128); // 0.05 margin = the pre-T7 buffer
      expect(ref.update).toHaveBeenCalledWith('none');
    });

    it('(a) price-axis reset leaves the x range alone', () => {
      const ref = refWithAxes();
      service.resetPriceScale(asRef(ref));
      expect(ref.scales.x.options.min).toBeUndefined();
      expect(ref.scales.x.min).toBe(40_000);
    });

    it('(b) time-axis reset while following: default spacing, right offset restored, latest candle visible; Y auto stays auto', () => {
      const ref = refWithAxes({ min: 80_000, max: 101_000 }); // right edge 2 bars after the latest candle: near the live edge
      expect(service.liveFollowState).toBe('following');
      service.yAutoScale = true;
      expect(service.resetTimeScale(asRef(ref))).toBe(true);
      expect(service.timeScale.barSpacingPx).toBeCloseTo(DEFAULT_BAR_SPACING, 3);
      expect(service.timeScale.rightOffsetBars).toBeCloseTo(service.RIGHT_PADDING_BARS, 3);
      expect(ref.scales.x.options.max).toBeCloseTo(99_000 + service.RIGHT_PADDING_BARS * STEP, 3);
      expect(service.timeScale.isAtLiveEdge()).toBe(true);
      expect(service.yAutoScale).toBe(true);
      // Y refit to the new visible candles (auto): the latest candles (high 209) are in view now
      expect(ref.scales.y.options.max!).toBeGreaterThan(209);
    });

    it('(b) time-axis reset while following leaves a manual Y range untouched', () => {
      const ref = refWithAxes({ min: 80_000, max: 101_000 }, { min: 10, max: 20 });
      service.yAutoScale = false;
      service.resetTimeScale(asRef(ref));
      expect(service.yAutoScale).toBe(false);
      expect(ref.scales.y.options.min).toBeUndefined();
      expect(ref.scales.y.min).toBe(10);
      expect(ref.scales.y.max).toBe(20);
      expect(service.timeScale.barSpacingPx).toBeCloseTo(DEFAULT_BAR_SPACING, 3);
    });

    it('(c) time-axis reset while detached: default spacing, plot-center time preserved, no jump to the latest candle', () => {
      for (const manual of [false, true]) {
        const ref = refWithAxes({ min: 30_000, max: 50_000 }, { min: 10, max: 20 });
        service.yAutoScale = !manual;
        detach(ref);
        const before = centerTime();
        const yBefore = { min: ref.scales.y.options.min, max: ref.scales.y.options.max };
        expect(service.resetTimeScale(asRef(ref))).toBe(true);
        expect(service.timeScale.barSpacingPx).toBeCloseTo(DEFAULT_BAR_SPACING, 3);
        expect(Math.abs(centerTime() - before)).toBeLessThan(STEP * 0.5);
        expect(ref.scales.x.options.max!).toBeLessThan(99_000);
        expect(service.timeScale.isAtLiveEdge()).toBe(false);
        expect(service.liveFollowState).toBe('detached');
        expect(service.yAutoScale).toBe(!manual);
        if (manual) expect({ min: ref.scales.y.options.min, max: ref.scales.y.options.max }).toEqual(yBefore);
      }
    });

    it('(c) detached reset clamps to the extended data range', () => {
      const ref = refWithAxes({ min: -39_000, max: -19_000 });
      detach(ref);
      service.resetTimeScale(asRef(ref));
      expect(ref.scales.x.options.min!).toBeGreaterThanOrEqual(service.extendedDataRange.min - 1e-6);
      expect(ref.scales.x.options.max!).toBeLessThanOrEqual(service.extendedDataRange.max + 1e-6);
    });

    it('time-axis reset after a wheel zoom anchored near the left (latest candle off-screen) keeps the plot-center time', () => {
      const data = candles(300);
      service.setRanges({ min: 0, max: 299_000 }, { min: -10_000, max: 309_000 }, { min: 90, max: 389 });
      service.computeExtendedRange(data);
      const ref = chartRef(data, { min: 280_000, max: 302_000 });
      ref.chartArea = { left: 0, right: 700, top: 0, bottom: 550 };
      const wheel = { deltaY: -100, deltaMode: 0, clientX: 70, clientY: 300, ctrlKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as WheelEvent;
      for (let i = 0; i < 10; i++) service.onWheel(wheel, asRef(ref));
      expect(service.timeScale.isAtLiveEdge()).toBe(false);
      const before = centerTime();
      expect(service.resetTimeScale(asRef(ref))).toBe(true);
      expect(service.timeScale.barSpacingPx).toBeCloseTo(DEFAULT_BAR_SPACING, 3);
      expect(Math.abs(centerTime() - before)).toBeLessThan(STEP * 0.5);
      expect(service.liveFollowState).toBe('detached');
    });

    it('live candle refit: skipped during a gesture, only when the last candle leaves the y range, never after a manual scale', () => {
      const data = candles();
      const ref = refWithAxes({ min: 40_000, max: 60_000 }, { min: 100, max: 200 });
      ref.data.datasets[0]['data'] = data;
      service.yAutoScale = true;
      // last candle (high 209 / low 189) sticks out above 200 -> refit
      service.isInteracting = true;
      service.refitYForLiveCandle(asRef(ref));
      expect(ref.scales.y.options).toEqual({});
      service.isInteracting = false;
      service.refitYForLiveCandle(asRef(ref));
      expect(ref.scales.y.options.max).toBeDefined();
      // inside the range: nothing, so a user's y offset survives ticks
      const inside = refWithAxes({ min: 40_000, max: 60_000 }, { min: 0, max: 1000 });
      inside.data.datasets[0]['data'] = data;
      service.refitYForLiveCandle(asRef(inside));
      expect(inside.scales.y.options).toEqual({});
      service.yAutoScale = false;
      service.refitYForLiveCandle(asRef(ref));
      expect(service.yAutoScale).toBe(false);
    });

    it('(d) the service has no plot reset: a click on the plot changes neither range nor Y mode', () => {
      const ref = refWithAxes({ min: 40_000, max: 60_000 }, { min: 10, max: 20 });
      service.yAutoScale = false;
      expect(service.axisAt(asRef(ref), 350, 300)).toBeNull();
      expect(ref.scales.x.options).toEqual({});
      expect(ref.scales.y.options).toEqual({});
      expect(service.yAutoScale).toBe(false);
    });

    it('(g) hit regions: just inside vs just outside the axes', () => {
      const ref = refWithAxes();
      const at = (x: number, y: number) => service.axisAt(asRef(ref), x, y);
      expect(at(700, 300)).toBeNull(); // last plot pixel
      expect(at(701, 300)).toBe('y');
      expect(at(300, 550)).toBeNull(); // last plot pixel
      expect(at(300, 551)).toBe('x');
      expect(at(701, 551)).toBeNull(); // corner: neither axis
      expect(at(-1, 300)).toBe('y'); // left of the plot (left price axis)
    });

    it('does nothing and reports false when the TimeScale is not ready', () => {
      const ref = chartRef([]);
      expect(service.resetTimeScale(asRef(ref))).toBe(false);
      expect(ref.scales.x.options).toEqual({});
    });
  });
});
