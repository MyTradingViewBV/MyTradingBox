/**
 * T11: one interaction state machine, enforced service-wide (main chart + linked pane + MCB value-axis claim).
 * Exclusivity, cleanup on every end path (release, touchcancel, blur, destroy / navigation), the unified anchored
 * touch / wheel price and time scales, dblclick vs drag, and text selection during captured drags.
 */
import { TestBed } from '@angular/core/testing';
import { ChartInteractionService } from './chart-interaction.service';
import { PRICE_AXIS_SCALE_SENSITIVITY, TIME_AXIS_SCALE_SENSITIVITY, WHEEL_ZOOM_SENSITIVITY } from '../scales/time-scale';

const STEP = 1000;

function candles(count = 100) {
  return Array.from({ length: count }, (_, i) => ({ x: i * STEP, h: 110 + i, l: 90 + i }));
}

/** 800x600 plot at the canvas origin over 40000..60000 (20 bars of 40px); price axis right of 800, time axis below 600. */
function chartRef(y = { min: 100, max: 200 }) {
  const scales = {
    x: { min: 40_000, max: 60_000, options: {} as { min?: number; max?: number } },
    y: { ...y, options: {} as { min?: number; max?: number } },
  };
  return {
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect },
    chartArea: { left: 0, right: 800, top: 0, bottom: 600 },
    scales,
    data: { datasets: [{ type: 'candlestick', data: candles() }] as Array<Record<string, unknown>> },
    config: { options: { scales: {} } },
    width: 800,
    height: 600,
    // Like Chart.js: an update renders the option ranges.
    update: vi.fn(() => {
      for (const s of [scales.x, scales.y]) {
        if (typeof s.options.min === 'number') s.min = s.options.min;
        if (typeof s.options.max === 'number') s.max = s.options.max;
      }
    }),
    draw: vi.fn(),
  };
}

type Ref = ReturnType<typeof chartRef>;
const asRef = (r: Ref) => r as unknown as Parameters<ChartInteractionService['zoomTimeAtCursor']>[0];

const PRICE_X = 850; // price-axis region
const TIME_Y = 650; // time-axis region
const mouse = (x: number, y: number, button = 0) => ({ button, clientX: x, clientY: y }) as MouseEvent;
const touches = (...pts: Array<[number, number]>) =>
  ({ touches: pts.map(([clientX, clientY]) => ({ clientX, clientY })), preventDefault: vi.fn() }) as unknown as TouchEvent;
const two = (cx: number, d: number) => touches([cx - d / 2, 300], [cx + d / 2, 300]);
const wheel = (deltaY: number, clientX = 400, clientY = 300) =>
  ({ deltaY, deltaMode: 0, clientX, clientY, ctrlKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as WheelEvent;
const docMove = (x: number, y: number) => document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
const docUp = () => document.dispatchEvent(new MouseEvent('mouseup'));
const xRange = (r: Ref) => ({ min: r.scales.x.options.min, max: r.scales.x.options.max });
const yRange = (r: Ref) => ({ min: r.scales.y.options.min, max: r.scales.y.options.max });
const finiteRange = (range: { min?: number; max?: number }) =>
  Number.isFinite(range.min) && Number.isFinite(range.max) && range.max! > range.min!;

describe('ChartInteractionService state machine (T11)', () => {
  let service: ChartInteractionService;

  beforeEach(() => {
    service = TestBed.inject(ChartInteractionService);
    service.isInteracting = false;
    service.setRanges({ min: 0, max: 99_000 }, { min: -10_000, max: 109_000 }, { min: 90, max: 209 });
  });

  afterEach(() => {
    service.cancelAllGestures();
    vi.useRealTimers();
  });

  /** Run the throttled updates synchronously from here on (a gesture start sets isInteracting). */
  const sync = () => {
    service.isInteracting = false;
  };

  describe('activeGesture reflects the gesture state', () => {
    it('is null when idle and names each running gesture', () => {
      const ref = chartRef();
      expect(service.activeGesture).toBeNull();
      service.onMouseDown(mouse(400, 300), asRef(ref));
      expect(service.activeGesture).toBe('pan');
      docUp();
      service.onMouseDown(mouse(400, TIME_Y), asRef(ref));
      expect(service.activeGesture).toBe('zoom-x');
      docUp();
      service.onMouseDown(mouse(PRICE_X, 300), asRef(ref));
      expect(service.activeGesture).toBe('zoom-y');
      docUp();
      service.onTouchStart(touches([400, 300]), asRef(ref));
      expect(service.activeGesture).toBeNull(); // a touch that has not decided is no gesture yet
      service.onTouchStart(two(400, 100), asRef(ref));
      expect(service.activeGesture).toBe('pinch');
      service.onTouchEnd(touches(), asRef(ref));
      expect(service.claimGesture('mcb-value-scale')).toBe(true);
      expect(service.activeGesture).toBe('mcb-value-scale');
      service.releaseGesture('mcb-value-scale');
      expect(service.activeGesture).toBeNull();
    });
  });

  describe('MCB value-axis claim (MCB_VALUE_SCALE)', () => {
    it('is refused while any gesture runs', () => {
      const ref = chartRef();
      for (const press of [mouse(400, 300), mouse(400, TIME_Y), mouse(PRICE_X, 300)]) {
        service.onMouseDown(press, asRef(ref));
        expect(service.claimGesture('mcb-value-scale')).toBe(false);
        docUp();
      }
      service.onTouchStart(touches([400, 300]), asRef(ref));
      service.onTouchStart(two(400, 100), asRef(ref));
      expect(service.claimGesture('mcb-value-scale')).toBe(false);
      service.onTouchEnd(touches(), asRef(ref));
      expect(service.claimGesture('mcb-value-scale')).toBe(true);
    });

    it('while held, a main-chart mousedown is refused (no pan, no capture) and its mouseup does not end the claim', () => {
      const ref = chartRef();
      service.claimGesture('mcb-value-scale');
      service.onMouseDown(mouse(400, 300), asRef(ref));
      expect(service.gestureType).toBeNull();
      expect(service.isInteracting).toBe(false);
      docMove(500, 300);
      service.onMouseMove(mouse(500, 300), asRef(ref));
      expect(ref.scales.x.options).toEqual({});
      service.onMouseUp(mouse(500, 300), asRef(ref));
      expect(service.activeGesture).toBe('mcb-value-scale');
      // released: the next press pans again
      service.releaseGesture('mcb-value-scale');
      service.onMouseDown(mouse(400, 300), asRef(ref));
      sync();
      docMove(480, 300);
      expect(xRange(ref)).toEqual({ min: 38_000, max: 58_000 });
    });

    it('while held, touches, pinch, wheel, linked pan, time-axis scale and pane presses start nothing', () => {
      const ref = chartRef();
      service.claimGesture('mcb-value-scale');
      service.onTouchStart(touches([400, 300]), asRef(ref));
      service.onTouchMove(touches([460, 300]), asRef(ref));
      service.onTouchStart(two(400, 100), asRef(ref));
      service.onTouchMove(two(400, 200), asRef(ref));
      expect(service.beginPinch(asRef(ref), 100, 400)).toBe(false);
      service.onWheel(wheel(-100), asRef(ref));
      service.onWheel(wheel(-100, PRICE_X), asRef(ref));
      expect(service.beginLinkedPan(asRef(ref), 400)).toBe(false);
      expect(service.beginTimeAxisScale(asRef(ref), 400, 400)).toBe(false);
      expect(service.beginPriceAxisScale(asRef(ref), 300)).toBe(false);
      expect(service.beginPress('mouse')).toBe(false);
      expect(service.beginPress('touch')).toBe(false);
      expect(ref.scales.x.options).toEqual({});
      expect(ref.scales.y.options).toEqual({});
      expect(service.activeGesture).toBe('mcb-value-scale');
    });

    it('a pending touch (no gesture decided yet) does not block the claim, but then starts nothing', () => {
      const ref = chartRef();
      service.onTouchStart(touches([400, 300]), asRef(ref));
      expect(service.claimGesture('mcb-value-scale')).toBe(true);
      service.onTouchMove(touches([460, 300]), asRef(ref));
      expect(service.gestureType).toBeNull();
      expect(ref.scales.x.options).toEqual({});
    });

    it('release is owner-checked and idempotent', () => {
      service.releaseGesture('mcb-value-scale');
      expect(service.claimGesture('mcb-value-scale')).toBe(true);
      expect(service.claimGesture('mcb-value-scale')).toBe(false); // held
      service.releaseGesture('mcb-value-scale');
      service.releaseGesture('mcb-value-scale');
      expect(service.activeGesture).toBeNull();
    });
  });

  describe('begin* refuse while another gesture runs; pinch preempts', () => {
    it('a captured pan blocks a time-axis / price-axis start from another pane, and vice versa', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, 300), asRef(ref));
      expect(service.beginTimeAxisScale(asRef(ref), 400, 400)).toBe(false);
      expect(service.beginPriceAxisScale(asRef(ref), 300)).toBe(false);
      expect(service.activeGesture).toBe('pan');
      docUp();
      service.onMouseDown(mouse(400, TIME_Y), asRef(ref));
      expect(service.beginLinkedPan(asRef(ref), 400)).toBe(false);
      expect(service.beginPriceAxisScale(asRef(ref), 300)).toBe(false);
      expect(service.activeGesture).toBe('zoom-x');
      expect(service.gestureType).toBe('zoom-x');
    });

    it('a second finger takes over a touch pan / touch price scale (one gesture: the pan state is gone)', () => {
      const ref = chartRef();
      service.onTouchStart(touches([400, 300]), asRef(ref));
      service.onTouchMove(touches([440, 300]), asRef(ref));
      expect(service.activeGesture).toBe('pan');
      service.onTouchStart(two(440, 100), asRef(ref));
      expect(service.activeGesture).toBe('pinch');
      service.onTouchEnd(touches(), asRef(ref));

      service.onTouchStart(touches([PRICE_X, 300]), asRef(ref));
      service.onTouchMove(touches([PRICE_X, 330]), asRef(ref));
      expect(service.isPriceAxisScaling).toBe(true);
      service.onTouchStart(two(400, 100), asRef(ref));
      expect(service.isPriceAxisScaling).toBe(false);
      expect(service.activeGesture).toBe('pinch');
    });

    it('a mousedown during a pinch is refused and its mouseup does not end the pinch', () => {
      const ref = chartRef();
      service.onTouchStart(touches([400, 300]), asRef(ref));
      service.onTouchStart(two(400, 100), asRef(ref));
      service.onMouseDown(mouse(400, 300), asRef(ref));
      service.onMouseUp(mouse(400, 300), asRef(ref));
      expect(service.activeGesture).toBe('pinch');
      expect(service.gestureType).toBe('pinch');
      service.onTouchMove(two(400, 150), asRef(ref));
      expect(service.timeScale.barSpacingPx).toBeCloseTo(60, 6);
    });

    it('add / remove a second finger mid-pan repeatedly: always exactly one gesture, never NaN', () => {
      const ref = chartRef();
      service.onTouchStart(touches([400, 300]), asRef(ref));
      service.onTouchMove(touches([430, 300]), asRef(ref));
      for (let i = 0; i < 6; i++) {
        service.onTouchStart(two(430, 100 + i * 10), asRef(ref));
        expect(service.activeGesture).toBe('pinch');
        service.onTouchMove(two(430 + i, 150 + i * 10), asRef(ref));
        service.onTouchEnd(touches([480, 300]), asRef(ref)); // one finger lifts
        expect(service.activeGesture).toBeNull();
        service.onTouchMove(touches([520, 300]), asRef(ref)); // the remaining finger pans again
        expect(service.activeGesture).toBe('pan');
        expect(finiteRange(xRange(ref))).toBe(true);
      }
      service.onTouchEnd(touches(), asRef(ref));
      expect(service.activeGesture).toBeNull();
      expect(service.gestureType).toBeNull();
      expect(service.isInteracting).toBe(false);
    });
  });

  describe('stale gestures are cleared by a new press (mouse, touch, pane)', () => {
    it('a first finger drops a mouse drag whose release was lost (listeners included)', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, 300), asRef(ref)); // release lost
      service.onTouchStart(touches([200, 300]), asRef(ref));
      expect(service.activeGesture).toBeNull();
      docMove(600, 300);
      expect(ref.scales.x.options).toEqual({});
    });

    it('a first finger drops a pinch whose touchend was lost', () => {
      const ref = chartRef();
      service.onTouchStart(touches([400, 300]), asRef(ref));
      service.onTouchStart(two(400, 100), asRef(ref));
      service.onTouchStart(touches([400, 300]), asRef(ref)); // the pinch fingers never ended
      expect(service.isPinching).toBe(false);
      service.onTouchMove(touches([450, 300]), asRef(ref));
      expect(service.activeGesture).toBe('pan');
    });

    it('beginPress: mouse / touch clear stale drags; mouse is refused during a pinch, touch drops it', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(PRICE_X, 300), asRef(ref)); // release lost
      expect(service.beginPress('mouse')).toBe(true);
      expect(service.activeGesture).toBeNull();
      docMove(PRICE_X, 500);
      expect(ref.scales.y.options).toEqual({});

      service.onTouchStart(touches([400, 300]), asRef(ref));
      service.onTouchStart(two(400, 100), asRef(ref));
      expect(service.beginPress('mouse')).toBe(false);
      expect(service.isPinching).toBe(true);
      expect(service.beginPress('touch')).toBe(true);
      expect(service.isPinching).toBe(false);
    });
  });

  describe('cleanup on every end path', () => {
    it('cancelAllGestures (destroy / navigation) ends each gesture kind and drops its listeners', () => {
      const starts: Array<[string, (ref: Ref) => void]> = [
        ['pan', (r) => service.onMouseDown(mouse(400, 300), asRef(r))],
        ['zoom-x', (r) => service.onMouseDown(mouse(400, TIME_Y), asRef(r))],
        ['zoom-y', (r) => service.onMouseDown(mouse(PRICE_X, 300), asRef(r))],
        ['pinch', (r) => { service.onTouchStart(touches([400, 300]), asRef(r)); service.onTouchStart(two(400, 100), asRef(r)); }],
        ['linked pan', (r) => service.beginLinkedPan(asRef(r), 400)],
        ['touch zoom-y', (r) => { service.onTouchStart(touches([PRICE_X, 300]), asRef(r)); service.onTouchMove(touches([PRICE_X, 330]), asRef(r)); }],
      ];
      for (const [name, start] of starts) {
        const ref = chartRef();
        start(ref);
        expect(service.activeGesture, name).not.toBeNull();
        service.cancelAllGestures();
        expect(service.activeGesture, name).toBeNull();
        expect(service.gestureType, name).toBeNull();
        expect(service.isInteracting, name).toBe(false);
        const x = { ...ref.scales.x.options };
        const y = { ...ref.scales.y.options };
        docMove(700, 500);
        window.dispatchEvent(new Event('blur'));
        expect(ref.scales.x.options, name).toEqual(x);
        expect(ref.scales.y.options, name).toEqual(y);
      }
    });

    it('cancelAllGestures also drops the claim, a pinned touch crosshair and a pending long-press', () => {
      vi.useFakeTimers();
      const ref = chartRef();
      service.claimGesture('mcb-value-scale');
      service.cancelAllGestures();
      expect(service.activeGesture).toBeNull();
      service.pinCrosshair();
      service.cancelAllGestures();
      expect(service.isCrosshairPinned).toBe(false);
      service.onTouchStart(touches([400, 300]), asRef(ref));
      expect(vi.getTimerCount()).toBe(1);
      service.cancelAllGestures();
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(1000);
      expect(service.isCrosshairPinned).toBe(false);
    });

    it('a pending throttled update on a chart destroyed meanwhile does not throw', () => {
      vi.useFakeTimers();
      const ref = chartRef();
      service.onMouseDown(mouse(400, 300), asRef(ref)); // isInteracting: updates are throttled
      docMove(450, 300);
      ref.update.mockImplementation(() => {
        throw new Error('chart destroyed');
      });
      service.cancelAllGestures();
      expect(() => vi.runAllTimers()).not.toThrow();
    });

    it('touchcancel ends a touch pan, pinch and price scale like a release, and is never a tap', () => {
      const ref = chartRef();
      service.onTouchStart(touches([400, 300]), asRef(ref));
      service.onTouchMove(touches([440, 300]), asRef(ref));
      service.onTouchCancel(asRef(ref));
      expect(service.activeGesture).toBeNull();
      expect(service.isInteracting).toBe(false);
      service.onTouchStart(touches([400, 300]), asRef(ref));
      service.onTouchStart(two(400, 100), asRef(ref));
      service.onTouchCancel(asRef(ref));
      expect(service.activeGesture).toBeNull();
      expect(service.gestureType).toBeNull();
      // a short touch that is cancelled does not dismiss a pinned crosshair (that would be a tap)
      service.pinCrosshair();
      service.onTouchStart(touches([400, 300]), asRef(ref));
      service.onTouchCancel(asRef(ref));
      expect(service.isCrosshairPinned).toBe(true);
    });

    it('time-axis drag: leave the window, come back, release: ends once, nothing stuck', () => {
      const ref = chartRef();
      const ended = vi.fn();
      service.onTimeAxisScaleEnd = ended;
      service.onMouseDown(mouse(400, TIME_Y), asRef(ref));
      sync();
      service.onMouseLeave(asRef(ref)); // leaves the chart: the drag goes on
      docMove(-500, -200); // outside the window
      expect(service.isTimeAxisScaling).toBe(true);
      docMove(420, TIME_Y); // back
      service.onMouseUp(mouse(420, TIME_Y), asRef(ref)); // released on the chart
      expect(service.activeGesture).toBeNull();
      expect(service.gestureType).toBeNull();
      expect(ended).not.toHaveBeenCalled(); // the chart's own mouseup ended it, not the document listener
      docUp();
      window.dispatchEvent(new Event('blur'));
      expect(ended).not.toHaveBeenCalled();
      expect(finiteRange(xRange(ref))).toBe(true);
      service.onTimeAxisScaleEnd = undefined;
    });

    it('time-axis drag: the window loses focus outside the chart: ends via blur, later moves do nothing', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, TIME_Y), asRef(ref));
      sync();
      service.onMouseLeave(asRef(ref));
      docMove(1500, TIME_Y);
      window.dispatchEvent(new Event('blur'));
      expect(service.activeGesture).toBeNull();
      const after = xRange(ref);
      docMove(100, TIME_Y);
      expect(xRange(ref)).toEqual(after);
    });
  });

  describe('rapid alternation pan / wheel / axis drag', () => {
    it('a wheel during a drag is ignored (the drag owns the scale); between drags it zooms', () => {
      const ref = chartRef();
      for (let round = 0; round < 4; round++) {
        service.onMouseDown(mouse(400, 300), asRef(ref));
        sync();
        docMove(430, 300);
        const panned = xRange(ref);
        service.onWheel(wheel(-100), asRef(ref));
        expect(xRange(ref)).toEqual(panned);
        docMove(440, 300); // the pan continues from its start state
        service.onMouseUp(mouse(440, 300), asRef(ref));
        expect(service.activeGesture).toBeNull();

        const before = xRange(ref);
        service.onWheel(wheel(round % 2 === 0 ? -100 : 100), asRef(ref)); // alternate: stay off the spacing limits
        expect(xRange(ref)).not.toEqual(before);

        service.onMouseDown(mouse(PRICE_X, 300), asRef(ref));
        sync();
        docMove(PRICE_X, 340);
        const scaled = yRange(ref);
        service.onWheel(wheel(-100, PRICE_X), asRef(ref));
        service.onWheel(wheel(-100), asRef(ref));
        expect(yRange(ref)).toEqual(scaled);
        docUp();

        service.onMouseDown(mouse(400, TIME_Y), asRef(ref));
        sync();
        docMove(round % 2 === 0 ? 380 : 420, TIME_Y);
        const zoomed = xRange(ref);
        service.onWheel(wheel(100), asRef(ref));
        expect(xRange(ref)).toEqual(zoomed);
        service.onMouseUp(mouse(420, TIME_Y), asRef(ref));
        expect(service.activeGesture).toBeNull();
        expect(finiteRange(xRange(ref))).toBe(true);
        expect(finiteRange(yRange(ref))).toBe(true);
      }
      expect(service.gestureType).toBeNull();
      expect(service.isInteracting).toBe(false);
    });
  });

  describe('loose end 1: horizontal swipe from the price axis = anchored time-axis scale', () => {
    it('anchors the plot edge next to the axis, computes from the start state, swipe right zooms in', () => {
      const ref = chartRef();
      service.onTouchStart(touches([PRICE_X, 300]), asRef(ref));
      service.onTouchMove(touches([PRICE_X + 20, 300]), asRef(ref)); // past the 15px threshold: rebased here
      expect(service.gestureType).toBe('zoom-x');
      expect(service.isTimeAxisScaling).toBe(true);
      sync();
      const ts = service.timeScale;
      const path = [PRICE_X + 60, PRICE_X - 40, PRICE_X + 90, PRICE_X + 50];
      for (const x of path) {
        service.onTouchMove(touches([x, 300]), asRef(ref));
        sync();
        expect(ts.projectedTimeToX(60_000)).toBeCloseTo(800, 6); // the right edge (old pivot) stays put
        expect(ts.barSpacingPx).toBeCloseTo(40 * Math.exp((x - PRICE_X - 20) * TIME_AXIS_SCALE_SENSITIVITY), 6);
      }
      expect(ts.barSpacingPx).toBeGreaterThan(40); // net swipe right: wider candles
      service.onTouchEnd(touches(), asRef(ref));
      expect(service.activeGesture).toBeNull();
    });

    it('a horizontal swipe in the top margin anchors the time under the press', () => {
      const ref = { ...chartRef(), chartArea: { left: 0, right: 800, top: 50, bottom: 600 } };
      service.onTouchStart(touches([200, 20]), asRef(ref));
      service.onTouchMove(touches([180, 20]), asRef(ref));
      sync();
      service.onTouchMove(touches([140, 20]), asRef(ref));
      expect(service.timeScale.projectedTimeToX(45_000)).toBeCloseTo(200, 6);
      expect(service.timeScale.barSpacingPx).toBeLessThan(40); // swipe left: narrower candles
    });
  });

  describe('loose end 2: vertical swipe and wheel on the price axis = anchored price scale', () => {
    const span = (r: Ref) => r.scales.y.options.max! - r.scales.y.options.min!;
    const priceToY = (r: Ref, price: number) => ((r.scales.y.options.max! - price) / span(r)) * 600;

    it('vertical swipe: price under the press stays, swipe down zooms out, path-independent', () => {
      const run = (path: number[]) => {
        const ref = chartRef();
        service.onTouchStart(touches([PRICE_X, 150]), asRef(ref)); // anchor 175 at 25%
        service.onTouchMove(touches([PRICE_X, 170]), asRef(ref)); // threshold: rebased at y = 170
        expect(service.gestureType).toBe('zoom-y');
        sync();
        for (const y of path) {
          service.onTouchMove(touches([PRICE_X, y]), asRef(ref));
          expect(priceToY(ref, 175)).toBeCloseTo(150, 6);
        }
        const r = yRange(ref);
        service.onTouchEnd(touches(), asRef(ref));
        return r;
      };
      const direct = run([270]);
      expect(direct.max! - direct.min!).toBeCloseTo(100 * Math.exp(100 * PRICE_AXIS_SCALE_SENSITIVITY), 6);
      expect(direct.max! - direct.min!).toBeGreaterThan(100); // down = zoom out
      const wandered = run([400, 100, 20, 270]);
      expect(wandered.min).toBeCloseTo(direct.min!, 9);
      expect(wandered.max).toBeCloseTo(direct.max!, 9);
      const up = run([70]);
      expect(up.max! - up.min!).toBeLessThan(100); // up = zoom in
      expect(service.yAutoScale).toBe(false);
    });

    it('wheel: the price under the pointer stays, wheel up zooms in, down zooms out, by the time wheel notch', () => {
      const ref = chartRef();
      service.onWheel(wheel(-100, PRICE_X, 150), asRef(ref)); // 175 at 25%
      expect(priceToY(ref, 175)).toBeCloseTo(150, 6);
      expect(span(ref)).toBeCloseTo(100 / Math.exp(100 * WHEEL_ZOOM_SENSITIVITY), 6);
      expect(service.yAutoScale).toBe(false);
      for (const d of [-100, 100, 100, 100, -100]) {
        service.onWheel(wheel(d, PRICE_X, 150), asRef(ref));
        expect(priceToY(ref, 175)).toBeCloseTo(150, 6);
      }
      expect(span(ref)).toBeCloseTo(100, 6); // net zero notches: back to the start span
      service.onWheel(wheel(100, PRICE_X, 150), asRef(ref));
      expect(span(ref)).toBeCloseTo(100 * Math.exp(100 * WHEEL_ZOOM_SENSITIVITY), 6);
      expect(ref.scales.x.options).toEqual({});
    });

    it('wheel: zero / NaN delta and a missing y range change nothing', () => {
      const ref = chartRef();
      service.onWheel(wheel(0, PRICE_X), asRef(ref));
      service.onWheel(wheel(Number.NaN, PRICE_X), asRef(ref));
      expect(ref.scales.y.options).toEqual({});
      expect(service.yAutoScale).toBe(true);
      const bad = chartRef({ min: 5, max: 5 });
      service.onWheel(wheel(-100, PRICE_X), asRef(bad));
      expect(bad.scales.y.options).toEqual({});
    });
  });

  describe('double click vs drag', () => {
    it('a drag followed by a click is no double click; two clicks are', () => {
      const ref = chartRef();
      const click = (x: number, y: number) => {
        service.onMouseDown(mouse(x, y), asRef(ref));
        service.onMouseUp(mouse(x, y), asRef(ref));
      };
      click(400, 300);
      click(400, 300);
      expect(service.doubleClickFollowsDrag).toBe(false);

      // price-axis drag away and back, then a click at the press point
      service.onMouseDown(mouse(PRICE_X, 300), asRef(ref));
      sync();
      docMove(PRICE_X, 380);
      docMove(PRICE_X, 300);
      service.onMouseUp(mouse(PRICE_X, 300), asRef(ref));
      click(PRICE_X, 300);
      expect(service.doubleClickFollowsDrag).toBe(true);
      click(PRICE_X, 300);
      expect(service.doubleClickFollowsDrag).toBe(false);
    });

    it('drags ended outside the chart (document release) and from the MCB pane count too', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, TIME_Y), asRef(ref));
      sync();
      docMove(500, TIME_Y);
      docUp();
      expect(service.doubleClickFollowsDrag).toBe(true);

      service.cancelAllGestures();
      service.beginLinkedPan(asRef(ref), 400);
      sync();
      service.linkedPanTo(460, asRef(ref));
      service.endLinkedPan(asRef(ref));
      expect(service.doubleClickFollowsDrag).toBe(true);

      service.cancelAllGestures();
      service.beginTimeAxisScale(asRef(ref), 400, 400);
      service.endTimeAxisScale(asRef(ref)); // a click on the pane's time axis
      service.beginTimeAxisScale(asRef(ref), 400, 400);
      service.endTimeAxisScale(asRef(ref));
      expect(service.doubleClickFollowsDrag).toBe(false);
    });

    it('a move within the click slop is still a click', () => {
      const ref = chartRef();
      for (let i = 0; i < 2; i++) {
        service.onMouseDown(mouse(400, 300), asRef(ref));
        sync();
        docMove(403, 300);
        service.onMouseUp(mouse(403, 300), asRef(ref));
      }
      expect(service.doubleClickFollowsDrag).toBe(false);
    });
  });

  describe('text selection during captured drags', () => {
    const selectStart = () => {
      const event = new Event('selectstart', { cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    };

    it('is suppressed exactly while a document-captured drag runs (pan, time axis, price axis)', () => {
      const ref = chartRef();
      expect(selectStart()).toBe(false);
      for (const press of [mouse(400, 300), mouse(400, TIME_Y), mouse(PRICE_X, 300)]) {
        service.onMouseDown(press, asRef(ref));
        expect(selectStart()).toBe(true);
        docUp();
        expect(selectStart()).toBe(false);
      }
      service.onMouseDown(mouse(400, 300), asRef(ref));
      window.dispatchEvent(new Event('blur'));
      expect(selectStart()).toBe(false);
      service.onMouseDown(mouse(400, 300), asRef(ref));
      service.cancelAllGestures();
      expect(selectStart()).toBe(false);
    });

    it('touch and linked-pane drags (no document capture) never touch page selection', () => {
      const ref = chartRef();
      service.beginLinkedPan(asRef(ref), 400);
      expect(selectStart()).toBe(false);
    });
  });

  describe('timeframe switch after manual scaling', () => {
    it('the default view brings auto scale back with finite ranges and no gesture left', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(PRICE_X, 300), asRef(ref));
      sync();
      docMove(PRICE_X, 420);
      docUp();
      expect(service.yAutoScale).toBe(false);
      service.zoomToRecent(asRef(ref), candles(150));
      expect(service.yAutoScale).toBe(true);
      expect(service.activeGesture).toBeNull();
      expect(finiteRange(xRange(ref))).toBe(true);
      expect(finiteRange(yRange(ref))).toBe(true);
    });
  });
});
