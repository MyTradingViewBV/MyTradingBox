/**
 * Range math of ChartInteractionService (pan / zoom / fit / overscroll) on a
 * plain chart stub. With isInteracting=false every update runs synchronously.
 */
import { TestBed } from '@angular/core/testing';
import { ChartInteractionService } from './chart-interaction.service';

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
    it('zooms around the centre of the visible range', () => {
      const ref = chartRef();
      service.zoomHorizontal(1.1, asRef(ref));
      expect(ref.scales.x.options).toEqual({ min: 39_000, max: 61_000 });
      expect(ref.scales.x.min).toBe(39_000);
      expect(ref.update).toHaveBeenCalledWith('none');
    });

    it('keeps at least MIN_CANDLES_VISIBLE candles in view', () => {
      const ref = chartRef();
      service.zoomHorizontal(0.01, asRef(ref));
      // avg width = 99000 / 100 = 990; 10 candles = 9900
      expect(ref.scales.x.max - ref.scales.x.min).toBeCloseTo(9_900);
      expect((ref.scales.x.min + ref.scales.x.max) / 2).toBeCloseTo(50_000);
    });

    it('never zooms out beyond 98% of the data range', () => {
      const ref = chartRef();
      service.zoomHorizontal(100, asRef(ref));
      expect(ref.scales.x.max - ref.scales.x.min).toBeCloseTo(97_020);
    });

    it('clamps the zoomed range into the overscroll range', () => {
      const ref = chartRef(candles(), { min: 95_000, max: 105_000 });
      service.zoomHorizontal(2, asRef(ref));
      expect(ref.scales.x.options).toEqual({ min: 89_000, max: 109_000 });
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

    it('falls back to the centre for an anchor outside the visible range', () => {
      const ref = chartRef();
      service.zoomHorizontal(1.1, asRef(ref), 90_000);
      expect(ref.scales.x.options).toEqual({ min: 39_000, max: 61_000 });
    });

    it('maps a viewport x to the time under it, null outside the plot', () => {
      const ref = chartRef();
      expect(service.xValueAtClientX(asRef(ref), 200)).toBe(45_000);
      expect(service.xValueAtClientX(asRef(ref), 900)).toBeNull();
    });

    it('wheel zooms around the time under the cursor', () => {
      const ref = chartRef();
      const event = { deltaY: -1, clientX: 200, preventDefault: vi.fn() } as unknown as WheelEvent;
      service.onWheel(event, asRef(ref));
      // 0.9x around 45000: min 45000 - 5000*0.9, range 18000.
      expect(ref.scales.x.options.min).toBeCloseTo(40_500);
      expect(ref.scales.x.options.max).toBeCloseTo(58_500);
    });

    it('wheel uses an explicit anchor from a linked panel', () => {
      const ref = chartRef();
      const event = { deltaY: 1, clientX: 0, preventDefault: vi.fn() } as unknown as WheelEvent;
      service.onWheel(event, asRef(ref), 60_000);
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
      // after the 1.1x zoom candles 39..61 are visible: lows 129..151, highs 149..171
      expect(ref.scales.y.options.min).toBeCloseTo(129 - 2.1);
      expect(ref.scales.y.options.max).toBeCloseTo(171 + 2.1);
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

  it('resetZoom shows the last 100 candles with a 5% y buffer', () => {
    const data = candles(150);
    const ref = chartRef(data);
    service.resetZoom(asRef(ref), data);
    expect(ref.scales.x.options).toEqual({ min: 50 * STEP, max: 149 * STEP });
    // lows 140..239 / highs 160..259 -> range 119, buffer 5.95
    expect(ref.scales.y.options.min).toBeCloseTo(140 - 5.95);
    expect(ref.scales.y.options.max).toBeCloseTo(259 + 5.95);
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
