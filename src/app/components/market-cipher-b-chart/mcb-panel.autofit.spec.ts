import { fitMcbYRange } from './mcb-panel.component';

const pts = (...ys: Array<[number, number]>) => ys.map(([x, y]) => ({ x, y }));

describe('fitMcbYRange (TradingView auto scale)', () => {
  it('fits the visible points, includes 0 and pads 8% of the span', () => {
    const r = fitMcbYRange([{ label: 'wt1', data: pts([1, -30], [2, -10], [3, -40]) }], 1, 3)!;
    // data -40..-10, with 0 -> -40..0, span 40, pad 3.2
    expect(r.min).toBeCloseTo(-43.2, 6);
    expect(r.max).toBeCloseTo(3.2, 6);
  });

  it('ignores points outside the visible x-range, hidden datasets and the anchor', () => {
    const r = fitMcbYRange(
      [
        { label: 'wt1', data: pts([1, -500], [5, -20], [9, 500]) },
        { label: 'rsi', hidden: true, data: pts([5, 90]) },
        { label: 'anchor', data: pts([5, 999]) },
      ],
      4,
      6,
    )!;
    expect(r.min).toBeCloseTo(-20 - 20 * 0.08, 6);
    expect(r.max).toBeCloseTo(0 + 20 * 0.08, 6);
  });

  it('keeps the ±60 levels in view once the data comes near them', () => {
    const r = fitMcbYRange([{ data: pts([1, -50], [2, 46]) }], 0, 10)!;
    expect(r.min).toBeLessThan(-60);
    expect(r.max).toBeGreaterThan(60);
    const away = fitMcbYRange([{ data: pts([1, -40], [2, 20]) }], 0, 10)!;
    expect(away.min).toBeGreaterThan(-60);
    expect(away.max).toBeLessThan(60);
  });

  it('uses a minimum span for flat data and returns null without visible points', () => {
    const flat = fitMcbYRange([{ data: pts([1, 0]) }], 0, 10)!;
    expect(flat.max - flat.min).toBeCloseTo(10 * 1.16, 6);
    expect(fitMcbYRange([{ data: pts([1, 5]) }], 2, 10)).toBeNull();
    expect(fitMcbYRange([], 0, 10)).toBeNull();
    expect(fitMcbYRange([{ data: [null, { x: 1, y: NaN }] as unknown[] }], 0, 10)).toBeNull();
  });
});
