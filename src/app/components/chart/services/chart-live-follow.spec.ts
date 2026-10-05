/**
 * Explicit realtime viewport following (T10) in ChartInteractionService: new bars shift the view by
 * exactly their count while 'following', never while 'detached'; goToRealtime; the detach threshold
 * and the global follow command from the NgRx settings store.
 */
import { TestBed } from '@angular/core/testing';
import { Store, provideStore } from '@ngrx/store';
import { ChartInteractionService } from './chart-interaction.service';
import { ChartLinkedScaleService } from './chart-linked-scale.service';
import { LIVE_FOLLOW_THRESHOLD_BARS } from '../scales/time-scale';
import { rootReducers } from 'src/app/store/root.store';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { initialState as settingsInitialState } from 'src/app/store/settings/settings.reducer';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import {
  PERSISTED_KEYS,
  hydrateState,
  persistChanges,
} from 'src/app/store/persistence/state-persistence.meta-reducer';

const STEP = 1000;
type Candle = { x: number; h: number; l: number };

function candles(count = 100): Candle[] {
  return Array.from({ length: count }, (_, i) => ({ x: i * STEP, h: 110 + i, l: 90 + i }));
}

function append(data: Candle[], count: number): Candle[] {
  const last = data[data.length - 1].x;
  return [...data, ...Array.from({ length: count }, (_, i) => ({ x: last + (i + 1) * STEP, h: 300, l: 290 }))];
}

function chartRef(data = candles(), x = { min: 80_000, max: 102_000 }, y = { min: 0, max: 300 }) {
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
const asRef = (r: Ref) => r as unknown as Parameters<ChartInteractionService['goToRealtime']>[0];
const mouse = (x: number, y = 300) => ({ button: 0, clientX: x, clientY: y }) as MouseEvent;
const xRange = (r: Ref) => ({ min: r.scales.x.min, max: r.scales.x.max });

describe('ChartInteractionService realtime follow (T10)', () => {
  let service: ChartInteractionService;
  let store: Store;

  /** Pan the right edge far from the live edge: 'detached'. */
  const detach = (ref: Ref) => {
    service.onMouseDown(mouse(400), asRef(ref));
    service.onMouseMove(mouse(0), asRef(ref));
    service.onMouseUp(mouse(0), asRef(ref));
    expect(service.liveFollowState).toBe('detached');
  };

  /** What the live flush does with the appended candles: dataset in, follow, then the one update. */
  const flushAppend = (ref: Ref, data: Candle[], newBars: number) => {
    ref.data.datasets[0]['data'] = data;
    const moved = service.followLiveBars(asRef(ref), data, newBars);
    ref.update('none');
    return moved;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideStore(rootReducers)] });
    service = TestBed.inject(ChartInteractionService);
    store = TestBed.inject(Store);
    service.isInteracting = false;
    const data = candles();
    service.setRanges({ min: 0, max: 99_000 }, { min: 0, max: 0 }, { min: 90, max: 209 });
    service.computeExtendedRange(data);
  });

  describe('tick on the open candle', () => {
    it('(a) leaves the x range, bar spacing and follow state untouched', () => {
      const ref = chartRef();
      service.goToRealtime(asRef(ref));
      const before = xRange(ref);
      const spacing = service.timeScale.barSpacingPx;
      const data = candles();
      data[data.length - 1] = { ...data[data.length - 1], h: 999 }; // OHLC change only
      expect(flushAppend(ref, data, 0)).toBe(false);
      expect(xRange(ref)).toEqual(before);
      expect(service.timeScale.barSpacingPx).toBe(spacing);
      expect(service.liveFollowState).toBe('following');
    });
  });

  describe('new bar while following', () => {
    it('(b) shifts by exactly one bar: right offset in bars and spacing preserved, Y untouched', () => {
      const ref = chartRef(candles(), { min: 80_000, max: 102_000 }, { min: 10, max: 20 });
      const ts = service.timeScale;
      TestBed.inject(ChartLinkedScaleService).syncTimeScale(ref as never);
      const offset = ts.rightOffsetBars;
      const spacing = ts.barSpacingPx;
      expect(offset).toBeCloseTo(3, 9);

      expect(flushAppend(ref, append(candles(), 1), 1)).toBe(true);
      expect(ref.scales.x.min).toBeCloseTo(81_000, 6);
      expect(ref.scales.x.max).toBeCloseTo(103_000, 6);
      expect(ts.rightOffsetBars).toBeCloseTo(offset, 9);
      expect(ts.barSpacingPx).toBeCloseTo(spacing, 9);
      expect(ref.scales.y).toMatchObject({ min: 10, max: 20, options: {} });
      expect(service.liveFollowState).toBe('following');
    });

    it('(b) keeps a right offset that is not the default one (within the threshold)', () => {
      const ref = chartRef(candles(), { min: 79_500, max: 101_500 }); // 2.5 empty bars
      expect(flushAppend(ref, append(candles(), 1), 1)).toBe(true);
      expect(service.timeScale.rightOffsetBars).toBeCloseTo(2.5, 9);
      expect(ref.scales.x.max).toBeCloseTo(102_500, 6);
    });

    it('(b) main and MCB pane get the same range in the same frame (immediate projection, no delayed path)', () => {
      const linked = TestBed.inject(ChartLinkedScaleService);
      const raf = vi.fn();
      vi.stubGlobal('requestAnimationFrame', raf);
      const ref = chartRef();
      ref.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800 }) as DOMRect } as Ref['canvas'];
      const mcb = {
        scales: { x: { min: 0, max: 0, options: {} as { min?: number; max?: number } } },
        canvas: { isConnected: true, closest: () => null, getBoundingClientRect: () => ({}) },
        options: {},
        update: vi.fn(),
      };
      linked.registerMcbChart(mcb as never);
      // the linkedPanelSync afterUpdate hook of the real main chart
      ref.update = vi.fn(() => {
        linked.syncMcbFromRenderedMain(ref as never);
      });
      try {
        flushAppend(ref, append(candles(), 1), 1);
        expect(mcb.update).toHaveBeenCalledTimes(1);
        expect(mcb.scales.x.options.min).toBeCloseTo(81_000, 6);
        expect(mcb.scales.x.options.max).toBeCloseTo(103_000, 6);
        expect(mcb.scales.x.options).toEqual({ min: ref.scales.x.min, max: ref.scales.x.max });
        expect(raf).not.toHaveBeenCalled();
      } finally {
        linked.clearMcbChart();
        vi.unstubAllGlobals();
      }
    });

    it('(d) several bars in one flush (gap after a reconnect) shift by that count', () => {
      const ref = chartRef();
      expect(flushAppend(ref, append(candles(), 3), 3)).toBe(true);
      expect(ref.scales.x.min).toBeCloseTo(83_000, 6);
      expect(ref.scales.x.max).toBeCloseTo(105_000, 6);
      expect(service.timeScale.rightOffsetBars).toBeCloseTo(3, 9);
      expect(service.timeScale.barSpacingPx).toBeCloseTo(800 / 22, 9);
    });

    it('an append while the view sits at the overscroll edge keeps following (the edge moves with the data)', () => {
      service.setRanges({ min: 0, max: 99_000 }, { min: -10_000, max: 102_000 }, { min: 90, max: 209 });
      const ref = chartRef(); // right edge exactly at the overscroll max
      expect(flushAppend(ref, append(candles(), 1), 1)).toBe(true);
      expect(service.extendedDataRange.max).toBe(103_000);
      expect(ref.scales.x.max).toBeCloseTo(103_000, 6);
      expect(service.timeScale.rightOffsetBars).toBeCloseTo(3, 9);
    });

    it('does not shift while a gesture runs', () => {
      const ref = chartRef();
      service.isInteracting = true;
      const before = xRange(ref);
      expect(flushAppend(ref, append(candles(), 1), 1)).toBe(false);
      expect(xRange(ref)).toEqual(before);
    });
  });

  describe('zoom gestures re-judge the follow state (T10 audit)', () => {
    const wheelAt = (clientX: number) =>
      ({ deltaY: -300, deltaMode: 0, clientX, clientY: 300, ctrlKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as WheelEvent;

    it('wheel zoom anchored at 10% (latest candle off-screen) -> a new bar does not move the range, state detached', () => {
      const ref = chartRef();
      expect(service.liveFollowState).toBe('following');
      for (let i = 0; i < 3; i++) service.onWheel(wheelAt(80), asRef(ref));
      expect(service.timeScale.isAtLiveEdge()).toBe(false);
      expect(service.liveFollowState).toBe('detached');
      const before = xRange(ref);
      expect(flushAppend(ref, append(candles(), 1), 1)).toBe(false);
      expect(xRange(ref)).toEqual(before);
      expect(service.liveFollowState).toBe('detached');
    });

    it('followLiveBars judges the view itself: a stale "following" far from the live edge detaches instead of shifting', () => {
      const ref = chartRef(candles(), { min: 30_000, max: 50_000 });
      service.resetLiveFollow(); // stale state (e.g. a zoom path that does not re-judge)
      const before = xRange(ref);
      expect(flushAppend(ref, append(candles(), 1), 1)).toBe(false);
      expect(xRange(ref)).toEqual(before);
      expect(service.liveFollowState).toBe('detached');
    });

    it('the end of a pinch re-judges the state', () => {
      const ref = chartRef();
      expect(service.beginPinch(asRef(ref), 100, 80)).toBe(true);
      service.updatePinch(300, 80, asRef(ref));
      expect(service.liveFollowState).toBe('following'); // judged at the end, not per frame
      service.endPinch(asRef(ref));
      expect(service.liveFollowState).toBe('detached');
    });
  });

  describe('new bar while detached', () => {
    it('(c) leaves the range byte-identical; the candle joins the dataset', () => {
      const ref = chartRef();
      detach(ref);
      const before = xRange(ref);
      const opts = { ...ref.scales.x.options };
      const data = append(candles(), 1);
      expect(flushAppend(ref, data, 1)).toBe(false);
      expect(xRange(ref)).toEqual(before);
      expect(ref.scales.x.options).toEqual(opts);
      expect(ref.data.datasets[0]['data']).toBe(data);
      // the TimeScale re-sync of the render keeps the time range too
      TestBed.inject(ChartLinkedScaleService).syncTimeScale(ref as never);
      expect(service.timeScale.visibleTimeRange()).toEqual(before);
      expect(service.liveFollowState).toBe('detached');
    });

    it('appends only widen the pan limits (data and overscroll grow with the new last candle)', () => {
      const ref = chartRef();
      detach(ref);
      const ext = { ...service.extendedDataRange };
      const before = xRange(ref);
      flushAppend(ref, append(candles(), 50), 50);
      expect(service.fullDataRange.max).toBe(149_000);
      expect(service.extendedDataRange).toEqual({ min: ext.min, max: ext.max + 50_000 });
      expect(xRange(ref)).toEqual(before);
    });
  });

  describe('goToRealtime', () => {
    it('(e) newest candle back with the right offset, spacing preserved, following; Y auto refits', () => {
      const ref = chartRef(candles(), { min: 30_000, max: 50_000 }, { min: 10, max: 20 });
      detach(ref);
      const spacing = service.timeScale.barSpacingPx;
      service.yAutoScale = true;
      expect(service.goToRealtime(asRef(ref))).toBe(true);
      expect(ref.scales.x.max).toBeCloseTo(99_000 + service.RIGHT_PADDING_BARS * STEP, 6);
      expect(service.timeScale.rightOffsetBars).toBeCloseTo(service.RIGHT_PADDING_BARS, 6);
      expect(service.timeScale.barSpacingPx).toBeCloseTo(spacing, 6);
      expect(service.timeScale.isAtLiveEdge()).toBe(true);
      expect(service.liveFollowState).toBe('following');
      expect(service.yAutoScale).toBe(true);
      expect(ref.scales.y.options.max!).toBeGreaterThan(209);
    });

    it('(e) leaves a manual Y range and the manual mode untouched', () => {
      const ref = chartRef(candles(), { min: 30_000, max: 50_000 }, { min: 10, max: 20 });
      detach(ref);
      service.yAutoScale = false;
      expect(service.goToRealtime(asRef(ref))).toBe(true);
      expect(service.yAutoScale).toBe(false);
      expect(ref.scales.y).toMatchObject({ min: 10, max: 20, options: {} });
      expect(service.liveFollowState).toBe('following');
    });

    it('reports false and changes nothing when the TimeScale is not ready', () => {
      const ref = chartRef([]);
      service.detachLiveFollow();
      expect(service.goToRealtime(asRef(ref))).toBe(false);
      expect(service.liveFollowState).toBe('detached');
    });
  });

  describe('state resets', () => {
    it('(f) the default view (zoomToRecent / resetZoom / zoomToLatest) follows again', () => {
      for (const apply of [
        (r: Ref) => service.zoomToRecent(asRef(r)),
        (r: Ref) => service.resetZoom(asRef(r)),
        (r: Ref) => service.zoomToLatest(asRef(r)),
      ]) {
        const ref = chartRef();
        detach(ref);
        apply(ref);
        expect(service.liveFollowState).toBe('following');
      }
    });
  });

  describe('settings store', () => {
    it('(g) the detach threshold comes from the store', () => {
      expect(settingsInitialState.liveFollowThresholdBars).toBe(LIVE_FOLLOW_THRESHOLD_BARS);
      // a pan of 5.5 bars away from the live edge
      const pan = () => {
        const ref = chartRef();
        service.onMouseDown(mouse(400), asRef(ref));
        service.onMouseMove(mouse(200), asRef(ref));
        service.onMouseUp(mouse(200), asRef(ref));
      };
      pan();
      expect(service.liveFollowState).toBe('detached');
      store.dispatch(SettingsActions.setLiveFollowThresholdBars({ bars: 10 }));
      service.resetLiveFollow();
      pan();
      expect(service.liveFollowState).toBe('following');
      store.dispatch(SettingsActions.setLiveFollowThresholdBars({ bars: 1 }));
      pan();
      expect(service.liveFollowState).toBe('detached');
    });

    it('(g) the threshold persists (validated) like the other settings', () => {
      const storage = window.localStorage;
      storage.removeItem(PERSISTED_KEYS.liveFollowThreshold);
      const state = { appState: {} as never, settingsState: settingsInitialState };
      persistChanges(state, { ...state, settingsState: { ...settingsInitialState, liveFollowThresholdBars: 4 } }, storage);
      expect(storage.getItem(PERSISTED_KEYS.liveFollowThreshold)).toBe('4');
      expect(hydrateState(state, storage).settingsState.liveFollowThresholdBars).toBe(4);
      storage.setItem(PERSISTED_KEYS.liveFollowThreshold, '-1');
      expect(hydrateState(state, storage).settingsState.liveFollowThresholdBars).toBe(LIVE_FOLLOW_THRESHOLD_BARS);
      expect(storage.getItem(PERSISTED_KEYS.liveFollowThreshold)).toBeNull();
    });

    it('(h) setAllChartsLiveFollow emits every new command to subscribers, never the existing state', () => {
      const settings = TestBed.inject(SettingsService);
      settings.setAllChartsLiveFollow(true); // before the subscription: not replayed
      const seen: boolean[] = [];
      const sub = service.liveFollowRequests$.subscribe((v) => seen.push(v));
      expect(seen).toEqual([]);
      settings.setAllChartsLiveFollow(true);
      settings.setAllChartsLiveFollow(true);
      settings.setAllChartsLiveFollow(false);
      store.dispatch(SettingsActions.clear()); // a logout clear is no command
      expect(seen).toEqual([true, true, false]);
      sub.unsubscribe();
    });
  });
});
