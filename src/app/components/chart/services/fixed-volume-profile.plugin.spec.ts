/**
 * Rendering tests for the fixed volume profile plugin and its layer state,
 * with a recording 2D context and linear fake scales (no real canvas).
 */
import { FixedVolumeProfileDto } from 'src/app/modules/shared/models/chart/fixed-volume-profile.dto';
import { FIXED_PROFILE_COLORS, createFixedVolumeProfilePlugin } from './fixed-volume-profile.plugin';
import { FixedVolumeProfileLayerService } from './fixed-volume-profile-layer.service';

type Call = { fn: string; args: unknown[] };

function recordingContext() {
  const calls: Call[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push({ fn: key, args: [...args, { ...target }] });
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  /** Calls of `fn` with the context state (fillStyle, ...) at call time as the last arg. */
  const ofFn = (fn: string) => calls.filter((c) => c.fn === fn).map((c) => c.args);
  return { ctx, ofFn };
}

// x: 1px per minute from T0; y: price 0 at 1000px, 1px per price unit.
const T0 = Date.UTC(2026, 0, 1);
const minute = (m: number) => T0 + m * 60_000;
const xScale = { getPixelForValue: (v: unknown) => (Number(v) - T0) / 60_000 };
const yScale = { getPixelForValue: (v: unknown) => 1000 - Number(v) };
const AREA = { left: 0, right: 800, top: 0, bottom: 1000 };

function profile(p: Partial<FixedVolumeProfileDto> = {}): FixedVolumeProfileDto {
  return {
    Id: 1,
    ExchangeId: 1,
    Symbol: 'BTCUSDT',
    Timeframe: '1h',
    Name: 'VP test',
    StartTime: new Date(minute(100)).toISOString(),
    EndTime: new Date(minute(300)).toISOString(),
    ExtendRight: false,
    ...p,
  };
}

// Inside the range: prices 400..600; POC area around 500.
const candles = [
  { x: minute(50), o: 0, h: 900, l: 800, c: 0, v: 1000 }, // outside the range
  { x: minute(100), o: 0, h: 600, l: 400, c: 0, v: 100 },
  { x: minute(200), o: 0, h: 520, l: 480, c: 0, v: 500 },
  { x: minute(300), o: 0, h: 510, l: 490, c: 0, v: 300 },
];

describe('createFixedVolumeProfilePlugin', () => {
  let layer: FixedVolumeProfileLayerService;
  let rec: ReturnType<typeof recordingContext>;

  const render = (data: unknown[] = candles, type = 'candlestick') =>
    createFixedVolumeProfilePlugin(layer).beforeDatasetsDraw({
      config: { type },
      ctx: rec.ctx,
      scales: { x: xScale, y: yScale },
      chartArea: AREA,
      data: { datasets: [{ type: 'candlestick', data }] },
    } as unknown as import('chart.js').Chart);

  beforeEach(() => {
    layer = new FixedVolumeProfileLayerService();
    rec = recordingContext();
  });

  it('draws nothing and records no geometry while hidden', () => {
    layer.setProfiles([profile()]);
    layer.visible = false;
    render();
    expect(rec.ofFn('fillRect').length).toBe(0);
    expect(rec.ofFn('fill').length).toBe(0);
    expect(layer.hitTest(150, 500)).toBeNull();
  });

  it('draws a borderless range box over the computed price range and records its geometry', () => {
    layer.setProfiles([profile()]);
    layer.hoveredId = 1; // TEMP: the box is only filled while active
    render();
    // x 100..300, prices 400..600 -> y 400..600
    expect(rec.ofFn('fillRect')[0].slice(0, 4)).toEqual([100, 400, 200, 200]);
    expect(rec.ofFn('strokeRect')).toHaveLength(0);
    // A histogram bar moves; the empty rest of the box passes presses through.
    expect(layer.hitTest(110, 500)).toEqual({ id: 1, part: 'body' });
    expect(layer.hitTest(250, 450)).toBeNull();
    expect(layer.hitTest(102, 500)).toEqual({ id: 1, part: 'left' });
    expect(layer.hitTest(299, 500)).toEqual({ id: 1, part: 'right' });
    expect(layer.hitTest(200, 300)).toBeNull();
  });

  it('anchors bars at the left edge, at most 30% of the width, POC bar in the accent color', () => {
    layer.setProfiles([profile()]);
    layer.hoveredId = 1; // TEMP: the box is only filled while active
    render();
    const bars = rec.ofFn('fillRect').slice(1); // first fillRect is the box
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every((b) => b[0] === 100)).toBe(true);
    const widths = bars.map((b) => b[2] as number);
    expect(Math.max(...widths)).toBeCloseTo(60);
    const poc = bars.find((b) => (b[4] as { fillStyle: string }).fillStyle === FIXED_PROFILE_COLORS.pocBar);
    expect(poc?.[2]).toBeCloseTo(60);
  });

  it('draws POC solid and VAH/VAL dashed lines, extended to the right edge with ExtendRight', () => {
    layer.setProfiles([profile({ ExtendRight: true })]);
    render();
    const lineTo = rec.ofFn('lineTo');
    expect(lineTo).toHaveLength(3);
    expect(lineTo.every((l) => l[0] === AREA.right)).toBe(true);
    const strokes = rec.ofFn('stroke').map((s) => s[0] as { strokeStyle: string; lineWidth: number });
    expect(strokes[0]).toMatchObject({ strokeStyle: FIXED_PROFILE_COLORS.poc, lineWidth: 1.5 });
    expect(strokes[1]).toMatchObject({ strokeStyle: FIXED_PROFILE_COLORS.valueAreaLine, lineWidth: 1 });
    expect(rec.ofFn('setLineDash').map((d) => d[0])).toContainEqual([4, 3]);
  });

  it('ends the level lines at the range end without ExtendRight', () => {
    layer.setProfiles([profile()]);
    render();
    expect(rec.ofFn('lineTo').every((l) => l[0] === 300)).toBe(true);
  });

  it('draws no name label', () => {
    layer.setProfiles([profile()]);
    render();
    expect(rec.ofFn('fillText')).toHaveLength(0);
  });

  it('draws only a full-height box when no candles overlap the range', () => {
    layer.setProfiles([profile({ StartTime: new Date(minute(400)).toISOString(), EndTime: new Date(minute(500)).toISOString() })]);
    layer.hoveredId = 1; // TEMP: the box is only filled while active
    render();
    expect(rec.ofFn('fillRect')[0].slice(0, 4)).toEqual([400, 0, 100, 1000]);
    expect(rec.ofFn('lineTo')).toHaveLength(0);
    expect(rec.ofFn('fillText')).toHaveLength(0);
  });

  it('TEMP: draws no box fill while the range is idle', () => {
    layer.setProfiles([profile({ StartTime: new Date(minute(400)).toISOString(), EndTime: new Date(minute(500)).toISOString() })]);
    render();
    expect(rec.ofFn('fillRect')).toHaveLength(0);
  });

  it('skips non-candlestick charts', () => {
    layer.setProfiles([profile()]);
    render(candles, 'line');
    expect(rec.ofFn('fillRect')).toHaveLength(0);
  });

  it('clips hit geometry to the plot area so axis presses never reach a profile', () => {
    layer.setProfiles([profile({ EndTime: new Date(minute(900)).toISOString() })]);
    render();
    // The box runs past the right plot edge (x 800): a press on the price axis misses.
    expect(layer.hitTest(850, 500)).toBeNull();
    // The off-screen right edge is not grabbable as a resize handle.
    expect(layer.hitTest(798, 500)).toBeNull();
  });

  it('a fallback box without candles passes body presses through, keeping edges', () => {
    layer.setProfiles([profile({ StartTime: new Date(minute(400)).toISOString(), EndTime: new Date(minute(500)).toISOString() })]);
    render();
    expect(layer.hitTest(450, 500)).toBeNull();
    expect(layer.hitTest(402, 500)).toEqual({ id: 1, part: 'left' });
    expect(layer.hitTest(498, 500)).toEqual({ id: 1, part: 'right' });
  });

  it('ExtendRight computes over the range extended to the latest candle, like the bot', () => {
    layer.setProfiles([profile({ EndTime: new Date(minute(200)).toISOString(), ExtendRight: true })]);
    layer.hoveredId = 1; // TEMP: the box is only filled while active
    render();
    // Box and histogram run to the latest candle (minute 300); the lines to the right edge.
    expect(rec.ofFn('fillRect')[0].slice(0, 4)).toEqual([100, 400, 200, 200]);
    expect(rec.ofFn('lineTo').every((l) => l[0] === AREA.right)).toBe(true);
  });
});

describe('FixedVolumeProfileLayerService', () => {
  it('caches the histogram until the candles or the range change', () => {
    const layer = new FixedVolumeProfileLayerService();
    const p = profile();
    layer.setProfiles([p]);
    const first = layer.profileFor(p, candles);
    expect(first).not.toBeNull();
    expect(layer.profileFor(p, candles)).toBe(first);

    layer.setRange(1, minute(100), minute(200));
    const moved = layer.find(1)!;
    expect(moved.EndTime).toBe(new Date(minute(200)).toISOString());
    expect(layer.profileFor(moved, candles)).not.toBe(first);
    expect(layer.profileFor(moved, [...candles])).not.toBeNull();
  });

  it('keeps a closed range cached across live ticks and recomputes a live range', () => {
    const layer = new FixedVolumeProfileLayerService();
    const closed = profile({ Id: 1, EndTime: new Date(minute(200)).toISOString() });
    const live = profile({ Id: 2 });
    layer.setProfiles([closed, live]);
    const closedFirst = layer.profileFor(closed, candles);
    const liveFirst = layer.profileFor(live, candles);
    // A live tick replaces the array and changes only the last candle.
    const tick = [...candles.slice(0, -1), { ...candles[candles.length - 1], v: 999 }];
    expect(layer.profileFor(closed, tick)).toBe(closedFirst);
    expect(layer.profileFor(live, tick)).not.toBe(liveFirst);
  });

  it('drops selection state of removed or replaced profiles', () => {
    const layer = new FixedVolumeProfileLayerService();
    layer.setProfiles([profile(), profile({ Id: 2 })]);
    layer.selectedId = 2;
    layer.removeProfile(2);
    expect(layer.selectedId).toBeNull();
    layer.selectedId = 1;
    layer.setProfiles([profile({ Id: 3 })]);
    expect(layer.selectedId).toBeNull();
  });
});
