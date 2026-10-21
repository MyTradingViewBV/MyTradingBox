/** Box top / bottom price tags in the price-axis column. */
import { boxAxisTagPlugin } from './chart-plugins';
import { axisPriceTagsOf } from '../utils/axis-price-tags';

function fakeChart(datasets: unknown[], preTags: number[] = []) {
  const texts: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === 'fillText') return (t: string) => texts.push(t);
      return () => undefined;
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  const chart = {
    ctx,
    width: 900,
    chartArea: { left: 0, right: 800, top: 0, bottom: 1000 },
    scales: {
      x: { min: 0, max: 100, getPixelForValue: (v: unknown) => Number(v) },
      // price 0 at 1000px, 1px per price unit
      y: { left: 800, right: 880, getPixelForValue: (v: unknown) => 1000 - Number(v) },
    },
    data: { datasets },
    _axisPriceTags: preTags.map((y) => ({ price: 1000 - y, y, h: 16, label: '', text: '', color: '#fff' })),
  };
  return { chart, texts };
}

const box = (bottom: number, top: number, x1 = 10, x2 = 50) => ({
  isBox: true,
  borderColor: 'rgba(242,54,69,0.8)',
  data: [
    { x: x1, y: bottom },
    { x: x2, y: bottom },
    { x: x2, y: top },
    { x: x1, y: top },
  ],
});

describe('boxAxisTagPlugin', () => {
  it('tags the top and bottom price of a visible box', () => {
    const { chart, texts } = fakeChart([box(400, 600)]);
    boxAxisTagPlugin.afterDatasetsDraw(chart as unknown as import('chart.js').Chart);
    expect(texts).toEqual(['600.00', '400.00']);
    const labels = axisPriceTagsOf(chart).map((t) => t.label);
    expect(labels).toEqual(['Box top', 'Box bottom']);
  });

  it('skips boxes outside the visible time range and non-box datasets', () => {
    const { chart, texts } = fakeChart([box(400, 600, 200, 300), { data: [{ x: 10, y: 500 }] }]);
    boxAxisTagPlugin.afterDatasetsDraw(chart as unknown as import('chart.js').Chart);
    expect(texts).toEqual([]);
  });

  it('skips a tag that overlaps a tag already on the axis', () => {
    const { chart, texts } = fakeChart([box(400, 600)], [405]); // y 405 = price 595
    boxAxisTagPlugin.afterDatasetsDraw(chart as unknown as import('chart.js').Chart);
    expect(texts).toEqual(['400.00']);
  });
});
