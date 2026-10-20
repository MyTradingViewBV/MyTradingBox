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

  it('draws the range box over the computed price range and records its geometry', () => {
    layer.setProfiles([profile()]);
    render();
    const box = rec.ofFn('strokeRect')[0];
    // x 100..300, prices 400..600 -> y 400..600
    expect(box.slice(0, 4)).toEqual([100, 400, 200, 200]);
    expect(layer.hitTest(200, 500)).toEqual({ id: 1, part: 'body' });
    expect(layer.hitTest(102, 500)).toEqual({ id: 1, part: 'left' });
    expect(layer.hitTest(299, 500)).toEqual({ id: 1, part: 'right' });
    expect(layer.hitTest(200, 300)).toBeNull();
  });

  it('anchors bars at the left edge, at most 30% of the width, POC bar in the accent color', () => {
    layer.setProfiles([profile()]);
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

  it('labels the profile with its name at the top-left', () => {
    layer.setProfiles([profile()]);
    render();
    expect(rec.ofFn('fillText')[0].slice(0, 3)).toEqual(['VP test', 104, 404]);
  });

  it('draws only a full-height box and the name when no candles overlap the range', () => {
    layer.setProfiles([profile({ StartTime: new Date(minute(400)).toISOString(), EndTime: new Date(minute(500)).toISOString() })]);
    render();
    expect(rec.ofFn('strokeRect')[0].slice(0, 4)).toEqual([400, 0, 100, 1000]);
    expect(rec.ofFn('lineTo')).toHaveLength(0);
    expect(rec.ofFn('fillText')[0][0]).toBe('VP test');
  });

  it('skips non-candlestick charts', () => {
    layer.setProfiles([profile()]);
    render(candles, 'line');
    expect(rec.ofFn('strokeRect')).toHaveLength(0);
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
