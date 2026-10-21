import type { Chart } from 'chart.js';
import { indicatorLabelPlugin } from './chart-plugins';

/** Records where each glyph is written. */
function fakeCtx() {
  const texts: Array<{ text: string; x: number; y: number }> = [];
  return {
    texts,
    ctx: {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fillText: vi.fn((text: string, x: number, y: number) => texts.push({ text, x, y })),
      textBaseline: '',
      textAlign: '',
      fillStyle: '',
      font: '',
    },
  };
}

/** Price p sits at y = 500 - (p - 100) * pxPerPrice; x pixel = time. */
function chartWith(datasets: unknown[], pxPerPrice: number) {
  const { ctx, texts } = fakeCtx();
  const chart = {
    ctx,
    chartArea: { left: 0, right: 1000, top: 0, bottom: 1000 },
    scales: {
      x: { getPixelForValue: (v: number) => v },
      y: { getPixelForValue: (v: number) => 500 - (v - 100) * pxPerPrice },
    },
    data: { datasets },
  };
  return { chart: chart as unknown as Chart, texts };
}

const label = (glyph: string, anchor: 'above' | 'below', slot: number, price: number) => ({
  isIndicator: true,
  yAxisID: 'y',
  data: [{ x: 300, y: price }],
  glyph,
  glyphSize: 9,
  glyphAnchor: anchor,
  glyphSlot: slot,
});

describe('indicatorLabelPlugin anchored glyphs', () => {
  it('keeps the same pixel distance to the candle at every zoom level', () => {
    const datasets = [label('Ba', 'below', 0, 100), label('Sa', 'above', 0, 100)];
    for (const pxPerPrice of [0.5, 4, 40]) {
      const { chart, texts } = chartWith(datasets, pxPerPrice);
      indicatorLabelPlugin.afterDatasetsDraw(chart);
      // Candle low/high both at price 100 = y 500: gap 6 + half the glyph height.
      expect(texts).toEqual([
        { text: 'Ba', x: 300, y: 510.5 },
        { text: 'Sa', x: 300, y: 489.5 },
      ]);
    }
  });

  it('stacks further slots one line outward', () => {
    const { chart, texts } = chartWith([label('Ba+d', 'below', 0, 100), label('Ba', 'below', 1, 100)], 4);
    indicatorLabelPlugin.afterDatasetsDraw(chart);
    expect(texts.map((t) => t.y)).toEqual([510.5, 522.5]);
  });

  it('starts above a candle past its news marker', () => {
    const news = { isNews: true, newsMarkers: [{ x: 300, price: 100, highImpact: true, events: [] }], data: [] };
    const { chart, texts } = chartWith([news, label('Sa', 'above', 0, 100)], 4);
    indicatorLabelPlugin.afterDatasetsDraw(chart);
    expect(texts[0].y).toBe(489.5 - 16);
  });
});
