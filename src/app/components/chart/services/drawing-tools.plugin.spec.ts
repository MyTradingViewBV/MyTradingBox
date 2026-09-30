/**
 * Rendering tests for the drawing-tools Chart.js plugin. A recording 2D
 * context captures every canvas call, and linear fake scales map data to
 * pixels, so the geometry (coordinate conversion) and labels can be asserted
 * without a real canvas.
 */
import { createDrawingToolsPlugin } from './drawing-tools.plugin';
import { Drawing, DrawingToolsService } from './drawing-tools.service';

type Call = { fn: string; args: unknown[] };

/** Proxy-based CanvasRenderingContext2D double: records method calls, stores property writes. */
function recordingContext() {
  const calls: Call[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === 'measureText') {
        return (text: string) => {
          calls.push({ fn: 'measureText', args: [text] });
          return { width: text.length * 6 };
        };
      }
      return (...args: unknown[]) => {
        calls.push({ fn: key, args });
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      calls.push({ fn: `set:${key}`, args: [value] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const texts = () => calls.filter((c) => c.fn === 'fillText').map((c) => c.args[0] as string);
  const ofFn = (fn: string) => calls.filter((c) => c.fn === fn).map((c) => c.args);
  return { ctx, calls, texts, ofFn };
}

// x: 1px per minute from T0; y: price 0 at 1000px, 1px per price unit.
const T0 = Date.UTC(2026, 0, 1);
const minute = (m: number) => T0 + m * 60_000;
const xScale = {
  getPixelForValue: (v: unknown) => (Number(v) - T0) / 60_000,
  getValueForPixel: (p: number) => T0 + p * 60_000,
};
const yScale = {
  getPixelForValue: (v: unknown) => 1000 - Number(v),
  getValueForPixel: (p: number) => 1000 - p,
};
const AREA = { left: 0, right: 800, top: 0, bottom: 1000 };

function fakeChart(ctx: CanvasRenderingContext2D, overrides: Record<string, unknown> = {}) {
  return {
    config: { type: 'candlestick' },
    options: { plugins: {} },
    ctx,
    scales: { x: xScale, y: yScale },
    chartArea: AREA,
    canvas: { width: 900 },
    data: { datasets: [{ data: [] as unknown[] }] },
    ...overrides,
  } as unknown as import('chart.js').Chart;
}

function drawing(d: Partial<Drawing>): Drawing {
  return { id: 'd1', type: 'horizontal-line', points: [], color: '#123456', lineWidth: 1, ...d } as Drawing;
}

describe('createDrawingToolsPlugin', () => {
  let service: DrawingToolsService;
  let rec: ReturnType<typeof recordingContext>;
  let plugin: ReturnType<typeof createDrawingToolsPlugin>;

  const render = (overrides: Record<string, unknown> = {}) =>
    plugin.afterDatasetsDraw(fakeChart(rec.ctx, overrides));

  beforeEach(() => {
    service = new DrawingToolsService();
    rec = recordingContext();
    plugin = createDrawingToolsPlugin(service);
  });

  it('registers under the drawingTools id', () => {
    expect(plugin.id).toBe('drawingTools');
  });

  it('only renders on candlestick charts that did not opt out', () => {
    service.setDrawings([drawing({ points: [{ x: minute(0), y: 500 }] })]);
    render({ config: { type: 'line' } });
    render({ options: { plugins: { drawingTools: false } } });
    render({ chartArea: undefined });
    expect(rec.calls).toHaveLength(0);

    render();
    expect(rec.calls.length).toBeGreaterThan(0);
  });

  it('clips pass 1 to the chart area and restores the context', () => {
    render();
    const fns = rec.calls.map((c) => c.fn);
    expect(fns.slice(0, 4)).toEqual(['save', 'beginPath', 'rect', 'clip']);
    expect(rec.ofFn('rect')[0]).toEqual([0, 0, 800, 1000]);
    expect(fns).toContain('restore');
  });

  it('draws a horizontal line across the area at the price pixel plus an axis badge', () => {
    service.setDrawings([drawing({ points: [{ x: minute(0), y: 500 }] })]);
    render();
    expect(rec.ofFn('moveTo')).toContainEqual([0, 500]);
    expect(rec.ofFn('lineTo')).toContainEqual([800, 500]);
    // Price badge in the y-axis column (right of area.right).
    expect(rec.texts()).toContain('500.00');
    const badge = rec.ofFn('fillText').find((a) => a[0] === '500.00');
    expect(badge?.[1]).toBe(807); // area.right + 2 + 5
  });

  it('skips the axis badge when the price is outside the visible area', () => {
    service.setDrawings([drawing({ points: [{ x: minute(0), y: 5000 }] })]);
    render();
    expect(rec.texts()).not.toContain('5000.00');
  });

  it('draws a vertical line at the time pixel from top to bottom', () => {
    service.setDrawings([drawing({ type: 'vertical-line', points: [{ x: minute(250), y: 0 }] })]);
    render();
    expect(rec.ofFn('moveTo')).toContainEqual([250, 0]);
    expect(rec.ofFn('lineTo')).toContainEqual([250, 1000]);
  });

  it('draws a trend line between its points and shows handles only when selected', () => {
    const trend = drawing({ id: 't', type: 'trend-line', points: [{ x: minute(100), y: 700 }, { x: minute(200), y: 600 }] });
    service.setDrawings([trend]);
    render();
    expect(rec.ofFn('moveTo')).toContainEqual([100, 300]);
    expect(rec.ofFn('lineTo')).toContainEqual([200, 400]);
    expect(rec.ofFn('arc')).toHaveLength(0);

    rec = recordingContext();
    service.selectedDrawingId = 't';
    render();
    expect(rec.ofFn('arc').map((a) => [a[0], a[1]])).toEqual([[100, 300], [200, 400]]);
  });

  it('ignores incomplete trend lines and boxes', () => {
    service.setDrawings([
      drawing({ type: 'trend-line', points: [{ x: minute(1), y: 1 }] }),
      drawing({ type: 'box-green', points: [{ x: minute(1), y: 1 }] }),
    ]);
    render();
    expect(rec.ofFn('stroke')).toHaveLength(0);
    expect(rec.ofFn('fillRect')).toHaveLength(0);
  });

  it('draws a box as a normalized rect with a Long/Short label and top/bottom badges', () => {
    service.setDrawings([
      drawing({ type: 'box-red', points: [{ x: minute(600), y: 400 }, { x: minute(500), y: 500 }] }),
    ]);
    render();
    expect(rec.ofFn('fillRect')).toContainEqual([500, 500, 100, 100]);
    expect(rec.ofFn('strokeRect')).toContainEqual([500, 500, 100, 100]);
    expect(rec.ofFn('fillText')).toContainEqual(['Short', 550, 550]);
    expect(rec.texts()).toEqual(expect.arrayContaining(['500.00', '400.00']));
  });

  it('labels every fib retracement level with its price', () => {
    service.setDrawings([
      drawing({ type: 'fib-retracement', points: [{ x: minute(10), y: 100 }, { x: minute(90), y: 200 }], fibLevels: [0, 0.5, 1] }),
    ]);
    render();
    // price = p1 - level * (p1 - p0)
    expect(rec.texts()).toEqual(
      expect.arrayContaining(['0.0%  200.00', '50.0%  150.00', '100.0%  100.00']),
    );
    // Axis badges are prefixed with the level.
    expect(rec.texts()).toEqual(expect.arrayContaining(['50.0% 150.00']));
    // Level line at the 50% price pixel.
    expect(rec.ofFn('moveTo')).toContainEqual([0, 850]);
  });

  it('projects fib extension levels from the pullback point C', () => {
    service.setDrawings([
      drawing({
        type: 'fib-extension',
        points: [{ x: minute(10), y: 100 }, { x: minute(20), y: 200 }, { x: minute(30), y: 150 }],
        fibLevels: [0, 1, 1.618],
      }),
    ]);
    render();
    // price = C + level * (B - A)
    expect(rec.texts()).toEqual(
      expect.arrayContaining(['0.0%  150.00', '100.0%  250.00', '161.8%  311.80']),
    );
    // A -> B -> C path
    expect(rec.ofFn('lineTo')).toEqual(expect.arrayContaining([[20, 800], [30, 850]]));
  });

  it('renders a long position with TP/SL percentages and the risk:reward badge', () => {
    service.setDrawings([
      drawing({
        type: 'long-position',
        points: [{ x: minute(100), y: 100 }, { x: minute(300), y: 130 }, { x: minute(300), y: 90 }],
      }),
    ]);
    render();
    const texts = rec.texts();
    expect(texts).toContain('TP  130.00 (+30.00%)');
    expect(texts).toContain('SL  90.00 (-10.00%)');
    expect(texts).toContain('Long  R:R 3.00');
    expect(texts).toEqual(expect.arrayContaining(['Entry 100.00', 'High 130.00', 'Low 90.00']));
  });

  it('renders a short position (TP below entry)', () => {
    service.setDrawings([
      drawing({
        type: 'short-position',
        points: [{ x: minute(100), y: 100 }, { x: minute(300), y: 80 }, { x: minute(300), y: 110 }],
      }),
    ]);
    render();
    expect(rec.texts()).toEqual(
      expect.arrayContaining(['TP  80.00 (+20.00%)', 'SL  110.00 (-10.00%)', 'Short  R:R 2.00']),
    );
  });

  it('measures price/percent, bars and days with the ruler', () => {
    const day = 86_400_000;
    service.setDrawings([
      drawing({ type: 'ruler', points: [{ x: T0, y: 100 }, { x: T0 + 2 * day, y: 110 }] }),
    ]);
    const candles = [0, 1, 2, 3].map((i) => ({ x: T0 + i * day, y: 0 }));
    render({ data: { datasets: [{ data: candles }] } });
    expect(rec.texts()).toEqual(expect.arrayContaining(['10.00  (+10.00%)', '2 bars, 2d']));
  });

  describe('previews', () => {
    it('draws the snap indicator label', () => {
      service.setSnapIndicator(40, 50, 'H');
      render();
      expect(rec.ofFn('fillText')).toContainEqual(['H', 49, 45]);
    });

    it('previews a horizontal line at the cursor with a live price badge', () => {
      service.selectTool('horizontal-line');
      service.updateCursor(30, 250);
      render();
      expect(rec.ofFn('moveTo')).toContainEqual([0, 250]);
      expect(rec.ofFn('lineTo')).toContainEqual([800, 250]);
      expect(rec.texts()).toContain('750.00');
    });

    it('previews a trend line from the locked first point to the cursor', () => {
      service.selectTool('trend-line');
      service.addPoint(minute(100), 700, null);
      service.updateCursor(180, 350);
      render();
      expect(rec.ofFn('moveTo')).toContainEqual([100, 300]);
      expect(rec.ofFn('lineTo')).toContainEqual([180, 350]);
      // Step digits of the locked anchor and the cursor dot.
      expect(rec.texts()).toEqual(expect.arrayContaining(['1', '2']));
    });

    it('previews fib retracement levels towards the cursor price', () => {
      service.selectTool('fib-retracement');
      service.addPoint(minute(10), 100, null);
      service.updateCursor(90, 800); // price 200
      render();
      // 50% level between 200 and 100 -> price 150 -> 850px
      expect(rec.ofFn('moveTo')).toContainEqual([0, 850]);
    });

    it('draws nothing but the snap indicator without an active tool or cursor', () => {
      service.selectTool('trend-line');
      render();
      expect(rec.ofFn('fillText')).toHaveLength(0);
    });
  });
});
