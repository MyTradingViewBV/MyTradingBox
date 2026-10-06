/**
 * Main chart + MCB pane are horizontally ONE chart (T9): every timestamp sits at
 * the same viewport x in both panes, each read through its OWN rendered scale,
 * before and after every gesture and resize; the MCB x-range has exactly one
 * write path (the shared TimeScale projected onto its plot edges).
 *
 * The Chart.js side is simulated: `update()` on the main chart runs the
 * `linkedPanelSync` afterUpdate work, the MCB chart lays out its plot from its
 * layout padding, and the DOM rects come from plain stubs.
 */
import { TestBed } from '@angular/core/testing';
import { ChartInteractionService } from './chart-interaction.service';
import { ChartLinkedScaleService, LinkedChartRefLike } from './chart-linked-scale.service';

const STEP = 1000;
const candles = (count = 100) => Array.from({ length: count }, (_, i) => ({ x: i * STEP, h: 110 + i, l: 90 + i }));

interface Rect {
  left: number;
  width: number;
}
const domRect = (r: Rect) =>
  ({ left: r.left, right: r.left + r.width, width: r.width, top: 0, bottom: 100, height: 100 }) as DOMRect;

describe('Main chart + MCB pane: one horizontal chart', () => {
  let interaction: ChartInteractionService;
  let linked: ChartLinkedScaleService;
  let rafQueue: FrameRequestCallback[];
  // Main canvas at viewport 0, plot 0..800 (+80px price axis); the MCB canvas starts 1.4px in
  // (panel border + fractional layout), so its padding rounds and the residue goes into its range.
  let mainRect: Rect;
  let mcbRect: Rect;
  let bodyRect: Rect;
  let main: ReturnType<typeof makeMain>;
  let mcb: ReturnType<typeof makeMcb>;

  function makeMain() {
    const ref = {
      canvas: {
        getBoundingClientRect: () => domRect(mainRect),
        isConnected: true,
        dataset: { linkedPanel: 'main' },
      },
      chartArea: { left: 0, right: 800, top: 0, bottom: 600 },
      scales: {
        x: { min: 40_000, max: 60_000, options: { min: 40_000, max: 60_000 } as { min?: number; max?: number } },
        y: { min: 0, max: 300, options: {} as { min?: number; max?: number } },
      },
      data: { datasets: [{ type: 'candlestick', data: candles() }] as Array<Record<string, unknown>> },
      config: { options: { scales: {} } },
      width: 880,
      height: 620,
      // Chart.js update -> the global linkedPanelSync afterUpdate hook.
      update: vi.fn(() => {
        linked.syncMcbFromRenderedMain(ref as unknown as LinkedChartRefLike);
      }),
      draw: vi.fn(),
    };
    return ref;
  }

  function makeMcb() {
    const ref: LinkedChartRefLike & { update: ReturnType<typeof vi.fn>; height: number } = {
      width: 0,
      height: 130,
      canvas: {
        getBoundingClientRect: () => domRect(mcbRect),
        closest: () => ({ getBoundingClientRect: () => domRect(bodyRect) }),
        isConnected: true,
        dataset: { linkedPanel: 'mcb' },
      } as unknown as HTMLCanvasElement,
      chartArea: { left: 0, right: 0, top: 0, bottom: 100 },
      scales: { x: { options: {} } },
      options: { layout: { padding: { left: 10, right: 0, top: 4, bottom: 2 } } },
      // Chart.js layout of the pane: the plot spans its layout padding (y axis hidden).
      update: vi.fn(() => layoutMcb()),
    };
    return ref;
  }

  function layoutMcb(): void {
    const pad = mcb.options!.layout!.padding as { left: number; right: number };
    mcb.width = mcbRect.width;
    mcb.chartArea = { left: pad.left, right: mcbRect.width - pad.right, top: 0, bottom: 100 };
  }

  /** Viewport x of `t` through the main chart's own rendered scale. */
  const mainX = (t: number) => {
    const { min, max } = main.scales.x;
    const a = main.chartArea;
    return mainRect.left + a.left + ((t - min) / (max - min)) * (a.right - a.left);
  };
  /** Viewport x of `t` through the MCB pane's own rendered scale. */
  const mcbX = (t: number) => {
    const x = mcb.scales!.x!;
    const a = mcb.chartArea!;
    return mcbRect.left + a.left + ((t - x.min!) / (x.max! - x.min!)) * (a.right - a.left);
  };
  const TIMES = [45_000, 50_500, 58_250];
  const expectAligned = (label: string) => {
    for (const t of TIMES) {
      expect(Math.abs(mainX(t) - mcbX(t)), `${label}: t=${t}`).toBeLessThan(0.5);
    }
  };
  const flushFrames = () => {
    for (let i = 0; i < 5 && rafQueue.length; i++) {
      const callbacks = rafQueue;
      rafQueue = [];
      callbacks.forEach((cb) => cb(0));
    }
  };
  const asMain = () => main as unknown as Parameters<ChartInteractionService['zoomTimeAtCursor']>[0];
  const mouse = (x: number, y: number) => ({ button: 0, clientX: x, clientY: y }) as MouseEvent;
  const wheel = (deltaY: number, clientX: number) =>
    ({ deltaY, deltaMode: 0, clientX, clientY: 300, ctrlKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as WheelEvent;
  const visibleRange = () => ({ min: main.scales.x.options.min, max: main.scales.x.options.max });

  /** The MCB canvas resize hook + the page's post-resize sync (both run after any container resize). */
  const resizeMcbPane = () => {
    linked.realignMcbPlot(mcb);
    mcb.update('none');
    linked.syncLinkedCharts(main as unknown as LinkedChartRefLike, mcb);
    layoutMcb();
  };

  /** Splitter drag: the MCB grows by `dy`, the main plot loses the same height. Widths never change. */
  const splitterResize = (dy: number) => {
    main.chartArea = { ...main.chartArea, bottom: main.chartArea.bottom - dy };
    main.height -= dy;
    mcb.height += dy;
    // Main container resize: Chart.js resize hook (same width) + its update.
    linked.onMainResize(main as unknown as LinkedChartRefLike, mainRect.width);
    main.update();
    resizeMcbPane();
  };

  /** Browser window resize: both canvases and the panel body get `dw` wider. */
  const windowResize = (dw: number) => {
    const newWidth = mainRect.width + dw;
    // Chart.js resize hook first (before its layout): the TimeScale anchors the range for the new width.
    linked.onMainResize(main as unknown as LinkedChartRefLike, newWidth);
    mainRect = { ...mainRect, width: newWidth };
    mcbRect = { ...mcbRect, width: mcbRect.width + dw };
    bodyRect = { ...bodyRect, width: bodyRect.width + dw };
    main.width = newWidth;
    main.chartArea = { ...main.chartArea, right: main.chartArea.right + dw };
    main.update();
    resizeMcbPane();
  };

  beforeEach(() => {
    rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    interaction = TestBed.inject(ChartInteractionService);
    linked = TestBed.inject(ChartLinkedScaleService);
    interaction.isInteracting = false;
    interaction.setRanges({ min: 0, max: 99_000 }, { min: -10_000, max: 109_000 }, { min: 90, max: 209 });
    mainRect = { left: 0, width: 880 };
    mcbRect = { left: 1.4, width: 860 };
    bodyRect = { left: 1.4, width: 878 };
    main = makeMain();
    mcb = makeMcb();
    linked.registerMcbChart(mcb);
    linked.syncLinkedCharts(main as unknown as LinkedChartRefLike, mcb);
    layoutMcb();
    main.update();
    flushFrames();
  });

  afterEach(() => {
    document.dispatchEvent(new MouseEvent('mouseup'));
    interaction.isInteracting = false;
    interaction.gestureType = null;
    linked.clearMcbChart();
    vi.unstubAllGlobals();
  });

  it('the MCB plot is really offset (padding residue): the alignment is not trivially equal ranges', () => {
    // Left: the MCB canvas starts 1.4px right of the main plot (padding 0); right: 61px padding, 0.4px residue.
    expect(linked.mcbPlotOffsetLeft).toBeCloseTo(1.4, 6);
    expect(mcb.options!.layout!.padding).toMatchObject({ left: 0, right: 61 });
    expect(mcb.scales!.x!.options!.min).not.toBe(main.scales.x.min);
    expectAligned('initial');
  });

  it('alignment invariant: mainX(t) === mcbX(t) before and after zoom (wheel + axis), pan, splitter and window resize', () => {
    expectAligned('initial');

    interaction.onWheel(wheel(-100, 300), asMain());
    flushFrames();
    expectAligned('wheel zoom in');
    interaction.onWheel(wheel(160, 650), asMain());
    flushFrames();
    expectAligned('wheel zoom out');

    interaction.onMouseDown(mouse(300, 650), asMain()); // time axis (below the plot)
    interaction.isInteracting = false;
    expect(interaction.gestureType).toBe('zoom-x');
    for (const x of [340, 260, 410]) {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: 650 }));
      flushFrames();
      expectAligned(`axis zoom to ${x}`);
    }
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 410, clientY: 650 }));
    interaction.onMouseUp(mouse(410, 650), asMain());
    flushFrames();
    expectAligned('axis zoom end');

    interaction.onMouseDown(mouse(400, 300), asMain()); // plot: pan
    interaction.isInteracting = false;
    interaction.gestureType = 'pan';
    for (const x of [450, 520, 380]) {
      interaction.onMouseMove(mouse(x, 300), asMain());
      flushFrames();
      expectAligned(`pan to ${x}`);
    }
    interaction.onMouseUp(mouse(380, 300), asMain());
    flushFrames();
    expectAligned('pan end');

    // Pan from the MCB pane (forwarded through the host).
    interaction.beginLinkedPan(asMain(), 500);
    interaction.isInteracting = false;
    interaction.linkedPanTo(430, asMain());
    flushFrames();
    expectAligned('pane pan');
    interaction.endLinkedPan(asMain());
    flushFrames();
    expectAligned('pane pan end');

    splitterResize(120);
    flushFrames();
    expectAligned('splitter: MCB taller');
    splitterResize(-200);
    flushFrames();
    expectAligned('splitter: MCB shorter');

    windowResize(240);
    flushFrames();
    expectAligned('window wider');
    windowResize(-400);
    flushFrames();
    expectAligned('window narrower');
  });

  /** Timestamps at 10% / 50% / 90% of the visible range plus `extra` (e.g. the newest candle). */
  const expectAlignedAcrossView = (label: string, extra: number[] = []) => {
    const { min, max } = main.scales.x;
    for (const t of [min + 0.1 * (max - min), min + 0.5 * (max - min), min + 0.9 * (max - min), ...TIMES, ...extra]) {
      expect(Math.abs(mainX(t) - mcbX(t)), `${label}: t=${t}`).toBeLessThan(0.5);
    }
  };
  /** The live flush of chart-base: dataset in, followLiveBars, the one main update of the frame. */
  const liveFlush = (data: ReturnType<typeof candles>, newBars: number) => {
    main.data.datasets[0]['data'] = data;
    const moved = interaction.followLiveBars(asMain(), data, newBars);
    main.update();
    flushFrames();
    return moved;
  };
  const appendBars = (data: ReturnType<typeof candles>, count: number) => {
    const last = data[data.length - 1].x;
    return [...data, ...Array.from({ length: count }, (_, i) => ({ x: last + (i + 1) * STEP, h: 200, l: 190 }))];
  };

  it('alignment invariant on a NEW CANDLE while following and while detached (T12)', () => {
    // following: the newest candle at the right edge
    expect(interaction.goToRealtime(asMain())).toBe(true);
    main.update();
    flushFrames();
    expectAlignedAcrossView('following, before');
    let data = appendBars(candles(), 1);
    expect(liveFlush(data, 1)).toBe(true);
    expect(interaction.liveFollowState).toBe('following');
    expectAlignedAcrossView('following, after 1 bar', [data[data.length - 1].x]);
    data = appendBars(data, 2);
    expect(liveFlush(data, 2)).toBe(true);
    expectAlignedAcrossView('following, after 2 more bars', [data[data.length - 1].x]);

    // detached: pan back into history, then a bar arrives
    interaction.onMouseDown(mouse(400, 300), asMain());
    interaction.isInteracting = false;
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 750, clientY: 300 }));
    document.dispatchEvent(new MouseEvent('mouseup'));
    flushFrames();
    expect(interaction.liveFollowState).toBe('detached');
    const before = visibleRange();
    data = appendBars(data, 1);
    expect(liveFlush(data, 1)).toBe(false);
    expect(visibleRange()).toEqual(before);
    expectAlignedAcrossView('detached, after 1 bar', [data[data.length - 1].x]);
  });

  it('alignment invariant after a symbol / timeframe switch (default view of the new candles) (T12)', () => {
    // timeframe switch: 4x wider candles, the page applies the default view of the new data
    const tf = Array.from({ length: 300 }, (_, i) => ({ x: 1_000_000 + i * 4 * STEP, h: 50 + i, l: 40 + i }));
    interaction.setRanges({ min: tf[0].x, max: tf[tf.length - 1].x }, { min: tf[0].x - 100_000, max: tf[tf.length - 1].x + 100_000 }, { min: 40, max: 349 });
    main.data.datasets[0]['data'] = tf;
    interaction.zoomToRecent(asMain(), tf);
    flushFrames();
    expectAlignedAcrossView('timeframe switch', [tf[tf.length - 1].x]);
    // symbol switch: different prices and times
    const sym = Array.from({ length: 120 }, (_, i) => ({ x: 5_000_000 + i * STEP, h: 0.002 + i * 1e-5, l: 0.001 + i * 1e-5 }));
    interaction.setRanges({ min: sym[0].x, max: sym[sym.length - 1].x }, { min: sym[0].x - 40_000, max: sym[sym.length - 1].x + 40_000 }, { min: 0.001, max: 0.0032 });
    main.data.datasets[0]['data'] = sym;
    interaction.zoomToRecent(asMain(), sym);
    flushFrames();
    expectAlignedAcrossView('symbol switch', [sym[sym.length - 1].x]);
    expect(interaction.liveFollowState).toBe('following');
  });

  it('an MCB splitter resize changes neither the visible time range nor any candle X, and writes no range', () => {
    const applyToChart = vi.spyOn(linked.timeScale, 'applyToChart');
    const before = visibleRange();
    const candleXs = candles().map((c) => mainX(c.x));
    const mcbBefore = { ...mcb.scales!.x!.options };
    const spacing = linked.timeScale.barSpacingPx;

    for (const dy of [80, -150, 40]) {
      splitterResize(dy);
      flushFrames();
      expect(visibleRange()).toEqual(before);
      expect(main.scales.x.min).toBe(before.min);
      expect(main.scales.x.max).toBe(before.max);
      candles().forEach((c, i) => expect(mainX(c.x)).toBe(candleXs[i]));
      expect(mcb.scales!.x!.options).toEqual(mcbBefore);
      expect(linked.timeScale.barSpacingPx).toBe(spacing);
      expectAligned(`splitter ${dy}`);
    }
    // Re-applying the same range is a no-op: no range write on either pane.
    expect(applyToChart).not.toHaveBeenCalled();
  });

  it('one crosshair x: sharedCrosshairClientX is the main scale client x, clamped to its plot, after zoom/pan/resize', () => {
    // The real main chart maps time via its x scale; give the stub the same linear mapping.
    (main.scales.x as unknown as { getPixelForValue?: (t: number) => number }).getPixelForValue = (t: number) => {
      const { min, max } = main.scales.x;
      const a = main.chartArea;
      return a.left + ((t - min) / (max - min)) * (a.right - a.left);
    };
    // The drawn line is clamped to the main plot, so a time scrolled out of view sits at the edge.
    const clampedMainX = (t: number) =>
      Math.min(mainRect.left + main.chartArea.right, Math.max(mainRect.left + main.chartArea.left, mainX(t)));
    const expectShared = (label: string) => {
      for (const t of TIMES) {
        expect(linked.sharedCrosshairClientX(t), `${label}: t=${t}`).toBeCloseTo(clampedMainX(t), 9);
      }
    };
    expectShared('initial');

    interaction.onWheel(wheel(-100, 300), asMain());
    flushFrames();
    expectShared('wheel zoom');

    interaction.onMouseDown(mouse(400, 300), asMain());
    interaction.isInteracting = false;
    interaction.gestureType = 'pan';
    interaction.onMouseMove(mouse(470, 300), asMain());
    flushFrames();
    expectShared('pan');
    interaction.onMouseUp(mouse(470, 300), asMain());
    flushFrames();

    windowResize(240);
    flushFrames();
    expectShared('window resize');

    // Outside the visible range: clamped to the plot edges, like the drawn line.
    const { min, max } = main.scales.x;
    expect(linked.sharedCrosshairClientX(min - 10_000)).toBeCloseTo(mainRect.left + main.chartArea.left, 9);
    expect(linked.sharedCrosshairClientX(max + 10_000)).toBeCloseTo(mainRect.left + main.chartArea.right, 9);

    // No main chart: null, so panes fall back to their own scale.
    linked.clearMcbChart();
    expect(linked.sharedCrosshairClientX(TIMES[0])).toBeNull();
  });

  it('a window resize with the MCB open keeps T1 width anchoring (bar spacing) and the panes aligned', () => {
    const spacing = linked.timeScale.barSpacingPx;
    windowResize(200);
    flushFrames();
    expect(linked.timeScale.barSpacingPx).toBeCloseTo(spacing, 9);
    expectAligned('window resize');
  });

  it('one write path: a pan step or a zoom applies the range once per pane per frame (no double MCB writes)', () => {
    // Count every write of the x-range option, whatever code path does it.
    const counted = (target: { min?: number; max?: number }) => {
      const counter = { n: 0 };
      const proxy = new Proxy(target, {
        set: (obj, key, value) => {
          if (key === 'min') counter.n++;
          return Reflect.set(obj, key, value);
        },
      });
      return { proxy, counter };
    };
    const mainOpts = counted(main.scales.x.options);
    const mcbOpts = counted(mcb.scales!.x!.options!);
    main.scales.x.options = mainOpts.proxy;
    mcb.scales!.x!.options = mcbOpts.proxy;
    const applyToChart = vi.spyOn(linked.timeScale, 'applyToChart');
    const writes = () => {
      const result = { mainWrites: mainOpts.counter.n, mcbWrites: mcbOpts.counter.n };
      mainOpts.counter.n = 0;
      mcbOpts.counter.n = 0;
      return result;
    };

    interaction.onMouseDown(mouse(400, 300), asMain());
    interaction.isInteracting = false;
    interaction.gestureType = 'pan';
    for (const x of [430, 470, 455]) {
      interaction.onMouseMove(mouse(x, 300), asMain());
      flushFrames(); // the gesture's MCB projection frame + anything else queued
      expect(writes(), `pan to ${x}`).toEqual({ mainWrites: 1, mcbWrites: 1 });
    }
    interaction.onMouseUp(mouse(455, 300), asMain());
    flushFrames();
    writes();

    applyToChart.mockClear();
    interaction.onWheel(wheel(-100, 300), asMain());
    flushFrames();
    expect(writes(), 'wheel').toEqual({ mainWrites: 1, mcbWrites: 1 });
    // ...and the MCB write is the TimeScale projection for its plot edges.
    expect(applyToChart.mock.calls.filter(([chart, pane]) => chart === mcb && pane != null)).toHaveLength(1);

    // The MCB x-range is only ever written by the TimeScale projection for its plot edges.
    const ts = linked.timeScale;
    const pane = { left: ts.plotLeft + linked.mcbPlotOffsetLeft, right: ts.plotRight + 0.4 };
    expect(mcb.scales!.x!.options!.min).toBeCloseTo(ts.timeRangeForPlot(pane)!.min, 6);
    expect(mcb.scales!.x!.options!.max).toBeCloseTo(ts.timeRangeForPlot(pane)!.max, 6);
  });
});
