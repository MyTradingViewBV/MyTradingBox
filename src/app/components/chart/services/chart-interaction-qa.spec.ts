/**
 * T12 final QA: invariants of the interaction system that the T1-T11 suites did not pin down yet.
 * Time-axis drag anchored at 10% / 50% / 90%, the MIN_BAR_SPACING zoom-out stop, the pointer zoom in its
 * logical form, a detached tick, long realtime sequences and a seeded mixed-gesture stress run.
 */
import { TestBed } from '@angular/core/testing';
import { ChartInteractionService } from './chart-interaction.service';
import { ChartLinkedScaleService } from './chart-linked-scale.service';
import { MAX_BAR_SPACING, MIN_BAR_SPACING, TIME_AXIS_SCALE_SENSITIVITY } from '../scales/time-scale';

const STEP = 1000;
type Candle = { x: number; h: number; l: number };

function candles(count = 100): Candle[] {
  return Array.from({ length: count }, (_, i) => ({ x: i * STEP, h: 110 + (i % 7), l: 90 - (i % 5) }));
}

function append(data: Candle[], count: number): Candle[] {
  const last = data[data.length - 1].x;
  return [...data, ...Array.from({ length: count }, (_, i) => ({ x: last + (i + 1) * STEP, h: 120, l: 95 }))];
}

/** 800x600 plot at the canvas origin; price axis right of 800, time axis below 600. update() renders the option ranges. */
function chartRef(data = candles(), x = { min: 40_000, max: 60_000 }, y = { min: 0, max: 300 }) {
  const scales = {
    x: { ...x, options: {} as { min?: number; max?: number } },
    y: { ...y, options: {} as { min?: number; max?: number } },
  };
  return {
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect },
    chartArea: { left: 0, right: 800, top: 0, bottom: 600 },
    scales,
    data: { datasets: [{ type: 'candlestick', data }] as Array<Record<string, unknown>> },
    config: { options: { scales: {} } },
    width: 880,
    height: 620,
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
const TIME_Y = 650;
const PRICE_X = 850;
const mouse = (x: number, y: number) => ({ button: 0, clientX: x, clientY: y }) as MouseEvent;
const docMove = (x: number, y: number) => document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
const docUp = () => document.dispatchEvent(new MouseEvent('mouseup'));
const wheel = (deltaY: number, clientX: number, clientY = 300) =>
  ({ deltaY, deltaMode: 0, clientX, clientY, ctrlKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as WheelEvent;
const touches = (...pts: Array<[number, number]>) =>
  ({ touches: pts.map(([clientX, clientY]) => ({ clientX, clientY })), preventDefault: vi.fn() }) as unknown as TouchEvent;

describe('ChartInteractionService final QA (T12)', () => {
  let service: ChartInteractionService;

  beforeEach(() => {
    service = TestBed.inject(ChartInteractionService);
    service.isInteracting = false;
    service.setRanges({ min: 0, max: 99_000 }, { min: -10_000, max: 109_000 }, { min: 90, max: 209 });
  });

  afterEach(() => {
    docUp();
    service.cancelAllGestures();
  });

  describe('horizontal scale', () => {
    it('time-axis drag anchored at 10% / 50% / 90% of the width: the time under the press stays under it', () => {
      for (const frac of [0.1, 0.5, 0.9]) {
        const ref = chartRef();
        const startX = frac * 800;
        const anchor = 40_000 + frac * 20_000;
        service.onMouseDown(mouse(startX, TIME_Y), asRef(ref));
        service.isInteracting = false;
        expect(service.activeGesture).toBe('zoom-x');
        const ts = service.timeScale;
        const startSpacing = ts.barSpacingPx;
        for (const dx of [15, 60, -10, -90, 45, 0, -40]) {
          docMove(startX + dx, TIME_Y);
          expect(ts.projectedTimeToX(anchor), `${frac} dx=${dx}`).toBeCloseTo(startX, 6);
          expect(ts.barSpacingPx).toBeCloseTo(startSpacing * Math.exp(dx * TIME_AXIS_SCALE_SENSITIVITY), 6);
        }
        docUp();
        expect(service.activeGesture).toBeNull();
      }
    });

    it('max zoom-in stops at MAX_BAR_SPACING and max zoom-out at MIN_BAR_SPACING (anchor holds at both stops)', () => {
      // 5000 candles: the 98%-of-data span limit lies below MIN_BAR_SPACING here, so the spacing stop is what bites.
      const data = candles(5000);
      service.setRanges({ min: 0, max: 4_999_000 }, { min: -2_000_000, max: 7_000_000 }, { min: 85, max: 116 });
      const ref = chartRef(data);
      service.onMouseDown(mouse(400, TIME_Y), asRef(ref));
      service.isInteracting = false;
      const ts = service.timeScale;
      docMove(400 + 5000, TIME_Y);
      expect(ts.barSpacingPx).toBeCloseTo(MAX_BAR_SPACING, 6);
      expect(ts.projectedTimeToX(50_000)).toBeCloseTo(400, 6);
      docMove(400 - 5000, TIME_Y);
      expect(ts.barSpacingPx).toBeCloseTo(MIN_BAR_SPACING, 6);
      expect(ts.barSpacingPx).toBeGreaterThanOrEqual(MIN_BAR_SPACING - 1e-9);
      expect(ts.projectedTimeToX(50_000)).toBeCloseTo(400, 6);
      docMove(400 - 50_000, TIME_Y); // further out: stays at the stop, never reverses
      expect(ts.barSpacingPx).toBeCloseTo(MIN_BAR_SPACING, 6);
      docUp();

      // the wheel reaches the same stops
      for (let i = 0; i < 300; i++) service.onWheel(wheel(100, 400), asRef(ref));
      expect(ts.barSpacingPx).toBeCloseTo(MIN_BAR_SPACING, 6);
      for (let i = 0; i < 300; i++) service.onWheel(wheel(-100, 400), asRef(ref));
      expect(ts.barSpacingPx).toBeCloseTo(MAX_BAR_SPACING, 6);
    });
  });

  describe('pointer zoom, logical form', () => {
    // Even candles: the time anchor of the T3 tests and the logical anchor are the same statement
    // (logical <-> time is linear). With uneven candles the TIME is anchored on purpose (pixel-facing rule).
    it.each([0.05, 0.25, 0.5, 0.75, 0.95])('logicalBefore = xToLogical(pointerX) = logicalAfter at %s of the plot', (frac) => {
      const ref = chartRef();
      const pointerX = frac * 800;
      const linked = TestBed.inject(ChartLinkedScaleService);
      linked.syncTimeScale(ref as never);
      const ts = service.timeScale;
      for (const delta of [-100, -100, -300, 100, 250, -40]) {
        const logicalBefore = ts.xToLogical(ts.plotLeft + pointerX);
        const spacingBefore = ts.barSpacingPx;
        service.onWheel(wheel(delta, pointerX), asRef(ref));
        const logicalAfter = ts.xToLogical(ts.plotLeft + pointerX);
        expect(ts.barSpacingPx).not.toBeCloseTo(spacingBefore, 6);
        expect(Math.abs(logicalAfter - logicalBefore)).toBeLessThan(1e-9);
      }
    });
  });

  describe('realtime', () => {
    const flushAppend = (ref: Ref, data: Candle[], newBars: number) => {
      ref.data.datasets[0]['data'] = data;
      const moved = service.followLiveBars(asRef(ref), data, newBars);
      ref.update();
      return moved;
    };

    it('DETACHED + tick: range, bar spacing and state untouched', () => {
      const ref = chartRef();
      service.onMouseDown(mouse(400, 300), asRef(ref));
      docMove(700, 300);
      docUp();
      expect(service.liveFollowState).toBe('detached');
      const before = { min: ref.scales.x.min, max: ref.scales.x.max };
      const spacing = service.timeScale.barSpacingPx;
      const data = candles();
      data[data.length - 1] = { ...data[data.length - 1], h: 999 };
      expect(flushAppend(ref, data, 0)).toBe(false);
      TestBed.inject(ChartLinkedScaleService).syncTimeScale(ref as never);
      expect({ min: ref.scales.x.min, max: ref.scales.x.max }).toEqual(before);
      expect(service.timeScale.barSpacingPx).toBe(spacing);
      expect(service.liveFollowState).toBe('detached');
    });

    it('FOLLOWING through 100 single-bar appends: spacing and right offset never drift', () => {
      let data = candles();
      service.computeExtendedRange(data);
      const ref = chartRef(data, { min: 80_000, max: 102_000 });
      expect(service.goToRealtime(asRef(ref))).toBe(true);
      const ts = service.timeScale;
      const spacing = ts.barSpacingPx;
      for (let i = 0; i < 100; i++) {
        data = append(data, 1);
        expect(flushAppend(ref, data, 1)).toBe(true);
        expect(ts.rightOffsetBars).toBeCloseTo(service.RIGHT_PADDING_BARS, 6);
        expect(ts.barSpacingPx).toBeCloseTo(spacing, 6);
      }
      expect(ref.scales.x.max).toBeCloseTo(data[data.length - 1].x + service.RIGHT_PADDING_BARS * STEP, 3);
      expect(service.liveFollowState).toBe('following');
    });
  });

  describe('stress', () => {
    it('1000 alternating wheel notches at one pointer: anchor exact, finite, within the spacing stops', () => {
      const ref = chartRef();
      const ts = service.timeScale;
      service.onWheel(wheel(-1, 300), asRef(ref));
      const anchor = ts.projectedXToTime(ts.plotLeft + 300);
      for (let i = 0; i < 1000; i++) {
        service.onWheel(wheel(i % 3 === 0 ? 100 : -80, 300), asRef(ref));
        expect(ts.barSpacingPx).toBeGreaterThanOrEqual(MIN_BAR_SPACING - 1e-9);
        expect(ts.barSpacingPx).toBeLessThanOrEqual(MAX_BAR_SPACING + 1e-9);
        // the anchor holds until a data limit makes it yield; it never drifts while unconstrained
        const r = ts.visibleTimeRange()!;
        if (r.min > service.extendedDataRange.min && r.max < service.extendedDataRange.max && r.max - r.min < 97_000 && r.max - r.min > 10_000) {
          expect(ts.projectedTimeToX(anchor)).toBeCloseTo(300, 4);
        }
      }
    });

    it('seeded mixed gestures (pan, wheel, axis drags, pinch, touch swipes, cancel): invariants after every step', () => {
      let seed = 12345;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      const ref = chartRef();
      const ts = service.timeScale;
      const check = (label: string) => {
        const x = ref.scales.x.options;
        if (typeof x.min === 'number') {
          expect(Number.isFinite(x.min) && Number.isFinite(x.max!) && x.max! > x.min, label).toBe(true);
          expect(x.min, label).toBeGreaterThanOrEqual(service.extendedDataRange.min - 1e-6);
          expect(x.max!, label).toBeLessThanOrEqual(service.extendedDataRange.max + 1e-6);
        }
        const y = ref.scales.y.options;
        if (typeof y.min === 'number') expect(Number.isFinite(y.min) && Number.isFinite(y.max!) && y.max! > y.min, label).toBe(true);
        expect(ts.barSpacingPx, label).toBeGreaterThanOrEqual(MIN_BAR_SPACING - 1e-9);
        expect(ts.barSpacingPx, label).toBeLessThanOrEqual(MAX_BAR_SPACING + 1e-9);
      };
      for (let step = 0; step < 300; step++) {
        const kind = Math.floor(rnd() * 7);
        const label = `step ${step} kind ${kind}`;
        const x0 = 20 + rnd() * 760;
        const y0 = 20 + rnd() * 560;
        if (kind === 0) {
          service.onMouseDown(mouse(x0, y0), asRef(ref));
          service.isInteracting = false;
          for (let i = 0; i < 4; i++) docMove(x0 + (rnd() - 0.5) * 900, y0 + (rnd() - 0.5) * 300);
          docUp();
        } else if (kind === 1) {
          service.onWheel(wheel((rnd() - 0.5) * 600, x0), asRef(ref));
        } else if (kind === 2) {
          service.onMouseDown(mouse(x0, TIME_Y), asRef(ref));
          service.isInteracting = false;
          for (let i = 0; i < 4; i++) docMove(x0 + (rnd() - 0.5) * 2000, TIME_Y);
          docUp();
        } else if (kind === 3) {
          service.onMouseDown(mouse(PRICE_X, y0), asRef(ref));
          service.isInteracting = false;
          for (let i = 0; i < 4; i++) docMove(PRICE_X, y0 + (rnd() - 0.5) * 3000);
          docUp();
        } else if (kind === 4) {
          service.onTouchStart(touches([x0, y0]), asRef(ref));
          service.onTouchStart(touches([x0 - 40, y0], [x0 + 40, y0]), asRef(ref));
          service.isInteracting = false;
          for (let i = 0; i < 4; i++) {
            const d = 10 + rnd() * 600;
            const c = 20 + rnd() * 760;
            service.onTouchMove(touches([c - d / 2, y0], [c + d / 2, y0]), asRef(ref));
          }
          if (rnd() < 0.5) service.onTouchCancel(asRef(ref));
          else service.onTouchEnd(touches(), asRef(ref));
        } else if (kind === 5) {
          // touch swipe from an axis area or the plot, ended by touchend or touchcancel
          const start: [number, number] = rnd() < 0.33 ? [PRICE_X, y0] : rnd() < 0.5 ? [x0, TIME_Y] : [x0, y0];
          service.onTouchStart(touches(start), asRef(ref));
          for (let i = 0; i < 4; i++) {
            service.onTouchMove(touches([start[0] + (rnd() - 0.5) * 400, start[1] + (rnd() - 0.5) * 400]), asRef(ref));
            service.isInteracting = false;
          }
          if (rnd() < 0.5) service.onTouchCancel(asRef(ref));
          else service.onTouchEnd(touches(), asRef(ref));
        } else {
          service.resetTimeScale(asRef(ref));
        }
        expect(service.activeGesture, label).toBeNull();
        check(label);
      }
    });
  });
});
