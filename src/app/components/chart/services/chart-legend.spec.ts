import {
  CANDLE_DOWN_COLOR,
  CANDLE_UP_COLOR,
  buildLegendSegments,
  findCandleAt,
  formatLegendPrice,
  legendPlugin,
} from './chart-plugins';
import { readableLegendColor } from '../../market-cipher-b-chart/mcb-panel.component';

const candle = (x: number, o: number, c: number) => ({ x, o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c });

describe('chart legend', () => {
  it('finds the candle at an exact time, null otherwise', () => {
    const points = [candle(1000, 1, 2), candle(2000, 2, 3), candle(3000, 3, 2)];
    expect(findCandleAt(points, 2000)).toBe(points[1]);
    expect(findCandleAt(points, 3000)).toBe(points[2]);
    expect(findCandleAt(points, 2500)).toBeNull();
    expect(findCandleAt([], 1000)).toBeNull();
  });

  it('formats prices without thousands separators, more decimals for small prices', () => {
    expect(formatLegendPrice(81877.2)).toBe('81877.20');
    expect(formatLegendPrice(0)).toBe('0.00');
    expect(formatLegendPrice(0.000123)).toBe('0.000123');
    expect(formatLegendPrice(-12.3)).toBe('-12.30');
  });

  it('builds O/H/L/C and the change versus the previous close', () => {
    const text = buildLegendSegments({ x: 0, o: 100, h: 110, l: 95, c: 105 }, 100)
      .map((s) => s.text)
      .join('');
    expect(text).toBe('O100.00 H110.00 L95.00 C105.00 +5.00 (+5.00%)');
    const down = buildLegendSegments({ x: 0, o: 100, h: 101, l: 89, c: 90 }, null);
    expect(down[down.length - 1].text).toBe(' -10.00 (-10.00%)');
    expect(down.filter((s) => s.kind === 'label').map((s) => s.text.trim())).toEqual(['O', 'H', 'L', 'C']);
  });

  describe('plugin', () => {
    function fakeChart(title: string | undefined, points: ReturnType<typeof candle>[], crosshairTime: number | null = null) {
      const fills: Array<{ text: string; color: string }> = [];
      const ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        fillStyle: '',
        font: '',
        textAlign: '',
        textBaseline: '',
        measureText: (t: string) => ({ width: t.length * 6 }),
        fillText(text: string) {
          fills.push({ text, color: this.fillStyle });
        },
      };
      const chart = {
        ctx,
        chartArea: { left: 0, top: 0, right: 800, bottom: 400 },
        canvas: { dataset: title === undefined ? {} : { legendTitle: title } },
        data: { datasets: points.length ? [{ type: 'candlestick', data: points }] : [] },
        _crosshairTime: crosshairTime,
      };
      return { chart: chart as unknown as import('chart.js').Chart, fills };
    }

    it('draws the title and the latest candle in the candle colour', () => {
      const { chart, fills } = fakeChart('BTCUSDT · 1H · Binance', [candle(1000, 10, 12), candle(2000, 12, 11)]);
      legendPlugin.afterDraw(chart);
      expect(fills[0].text).toBe('BTCUSDT · 1H · Binance');
      expect(fills.find((f) => f.text === '12.00')?.color).toBe(CANDLE_DOWN_COLOR);
      expect(fills.some((f) => f.text === '11.00')).toBe(true);
    });

    it('follows the crosshair candle', () => {
      const { chart, fills } = fakeChart('X', [candle(1000, 10, 12), candle(2000, 12, 11)], 1000);
      legendPlugin.afterDraw(chart);
      expect(fills.find((f) => f.text === '10.00')?.color).toBe(CANDLE_UP_COLOR);
    });

    it('draws nothing on a chart without candles and title (e.g. the MCB pane)', () => {
      const { chart, fills } = fakeChart(undefined, []);
      legendPlugin.afterDraw(chart);
      expect(fills).toEqual([]);
    });
  });
});

describe('readableLegendColor', () => {
  it('keeps colours that are light enough', () => {
    expect(readableLegendColor('#c1cbff')).toBe('#c1cbff');
    expect(readableLegendColor('#ff5252')).toBe('#ff5252');
  });

  it('lightens a dark colour toward white', () => {
    const out = readableLegendColor('#0019fa');
    expect(out).toMatch(/^rgb\(/);
    const [r, g, b] = out.slice(4, -1).split(',').map(Number);
    expect((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255).toBeGreaterThanOrEqual(0.35);
    expect(b).toBeGreaterThan(r); // still blue
  });

  it('returns non-hex colours unchanged', () => {
    expect(readableLegendColor('rgba(1,2,3,0.5)')).toBe('rgba(1,2,3,0.5)');
  });
});
