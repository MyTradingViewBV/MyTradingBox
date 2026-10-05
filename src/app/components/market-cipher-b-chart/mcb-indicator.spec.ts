import {
  MCB_DEFAULT_VISIBILITY,
  MCB_SETTINGS,
  buildMcbPanelData,
  normalizeMcbVisibility,
  computeMcbSeries,
  seriesRsi,
  seriesSma,
  seriesStoch,
} from './mcb-indicator';
import { MCB_CHIP_HEIGHT, layoutMcbSideLabels, mcbAxisTicks, panMcbYRange, scaleMcbYRange } from './mcb-panel.component';

type Candle = { x: number; o: number; h: number; l: number; c: number };

function candlesFromCloses(closes: number[], body = 0.5): Candle[] {
  return closes.map((c, i) => ({
    x: 1_700_000_000_000 + i * 3_600_000,
    o: c - body,
    h: c + 1,
    l: c - 1,
    c,
  }));
}

function sine(count: number, period = 5, amp = 10): number[] {
  return Array.from({ length: count }, (_, i) => 100 + Math.sin(i / period) * amp);
}

describe('mcb-indicator helpers', () => {
  it('seriesSma averages full windows and skips windows with gaps', () => {
    expect(seriesSma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    expect(seriesSma([1, null, 3, 4, 5, 6], 2)).toEqual([null, null, null, 3.5, 4.5, 5.5]);
  });

  it('seriesRsi follows Wilder smoothing', () => {
    // Only gains -> 100, only losses -> 0.
    expect(seriesRsi([1, 2, 3, 4, 5], 2).slice(2)).toEqual([100, 100, 100]);
    expect(seriesRsi([5, 4, 3, 2, 1], 2).slice(2)).toEqual([0, 0, 0]);
    // +1, -1 seeds at 50; a further +1 gives avgUp 0.75 / avgDown 0.25 -> 75.
    const rsi = seriesRsi([1, 2, 1, 2], 2);
    expect(rsi[0]).toBeNull();
    expect(rsi[1]).toBeNull();
    expect(rsi[2]).toBeCloseTo(50);
    expect(rsi[3]).toBeCloseTo(75);
  });

  it('seriesStoch scales a value within its own window to 0..100', () => {
    expect(seriesStoch([10, 20, 15, 30], 3)).toEqual([null, null, 50, 100]);
    expect(seriesStoch([5, 5, 5], 3)).toEqual([null, null, null]);
  });
});

describe('computeMcbSeries', () => {
  it('derives wt2 as SMA(wt1, 4) and vwap as wt1 - wt2', () => {
    const series = computeMcbSeries(candlesFromCloses(sine(200)))!;
    const expected = seriesSma(series.wt1, MCB_SETTINGS.wtMaLen);
    series.wt2.forEach((v, i) => {
      if (v == null) expect(expected[i]).toBeNull();
      else expect(v).toBeCloseTo(expected[i] as number, 10);
    });
    const i = 150;
    expect(series.vwap[i]).toBeCloseTo((series.wt1[i] as number) - (series.wt2[i] as number), 10);
  });

  it('computes RSI+MFI from the candle body relative to its range', () => {
    // body 0.5 on a range of 2 -> 0.25 * 150 = 37.5, minus the 2.5 offset.
    const series = computeMcbSeries(candlesFromCloses(sine(100), 0.5))!;
    expect(series.mf[MCB_SETTINGS.mfiPeriod - 2]).toBeNull();
    expect(series.mf[MCB_SETTINGS.mfiPeriod - 1]).toBeCloseTo(35);
    expect(series.mf[99]).toBeCloseTo(35);
  });

  it('falls back to the previous close when open is missing', () => {
    const closes = sine(100);
    const candles = candlesFromCloses(closes).map(({ o, ...rest }) => rest);
    const series = computeMcbSeries(candles)!;
    expect(series.mf[99]).not.toBeNull();
  });

  it('keeps RSI and Stoch RSI within 0..100 and orders D after K', () => {
    const series = computeMcbSeries(candlesFromCloses(sine(300, 7, 15)))!;
    for (const v of [...series.rsi, ...series.stochK, ...series.stochD]) {
      if (v == null) continue;
      expect(v).toBeGreaterThanOrEqual(-1e-9); // rolling-sum float drift
      expect(v).toBeLessThanOrEqual(100 + 1e-9);
    }
    const firstK = series.stochK.findIndex((v) => v != null);
    const firstD = series.stochD.findIndex((v) => v != null);
    expect(firstD).toBe(firstK + MCB_SETTINGS.stochD - 1);
  });

  it('only flags buy signals below the oversold level and sells above overbought', () => {
    const series = computeMcbSeries(candlesFromCloses(sine(400, 6, 20)))!;
    expect(series.crosses.length).toBeGreaterThan(0);
    const wt2At = (x: number) => series.wt2[series.x.indexOf(x)] as number;
    for (const x of series.buySignals) {
      expect(wt2At(x)).toBeLessThanOrEqual(MCB_SETTINGS.osLevel);
      expect(series.crosses.find((c) => c.x === x)?.up).toBe(true);
    }
    for (const x of series.sellSignals) {
      expect(wt2At(x)).toBeGreaterThanOrEqual(MCB_SETTINGS.obLevel);
      expect(series.crosses.find((c) => c.x === x)?.up).toBe(false);
    }
  });
});

describe('buildMcbPanelData', () => {
  it('does not ship constant level datasets (the panel draws the levels)', () => {
    const panel = buildMcbPanelData(candlesFromCloses(sine(120)))!;
    const labels = panel.chartData.datasets.map((d: any) => d.label);
    expect(labels).not.toContain('OB 60');
    expect(labels).not.toContain('0');
  });

  it('returns only the live values as side chips, coloured like their lines', () => {
    const panel = buildMcbPanelData(candlesFromCloses(sine(120)), {
      ...MCB_DEFAULT_VISIBILITY,
      rsi: true,
      stochRsi: true,
    })!;
    expect(panel.sideValues.map((v) => v.key)).toEqual(['fast', 'slow', 'mf', 'rsi', 'stoch']);
    expect(panel.sideValues.find((v) => v.key === 'fast')?.color).toBe('#c1cbff');
  });

  it('omits chips for series that are not warmed up yet', () => {
    const panel = buildMcbPanelData(candlesFromCloses(sine(20)))!;
    expect(panel.sideValues.map((v) => v.key)).not.toContain('mf');
  });
});

describe('layoutMcbSideLabels', () => {
  const geometry = { top: 4, bottom: 160, min: -110, max: 110 };
  const chip = (key: string, value: number) => ({ key, value, color: '#fff', textColor: '#000' });

  it('places a chip at the y of its value', () => {
    const [label] = layoutMcbSideLabels([chip('fast', 0)], geometry).filter((l) => l.kind === 'value');
    const center = geometry.top + (geometry.bottom - geometry.top) / 2;
    expect(label.top).toBe(Math.round(center - MCB_CHIP_HEIGHT / 2));
  });

  it('keeps overlapping chips apart and inside the plot', () => {
    const values = [chip('a', 108), chip('b', 107), chip('c', 106), chip('d', 105), chip('e', 104)];
    const labels = layoutMcbSideLabels(values, geometry)
      .filter((l) => l.kind === 'value')
      .sort((x, y) => x.top - y.top);
    expect(labels[0].top).toBeGreaterThanOrEqual(geometry.top);
    expect(labels[labels.length - 1].top + MCB_CHIP_HEIGHT).toBeLessThanOrEqual(geometry.bottom);
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i].top - labels[i - 1].top).toBeGreaterThanOrEqual(MCB_CHIP_HEIGHT);
    }
  });

  it('shows round-number ticks unless a value tag covers them', () => {
    const keys = layoutMcbSideLabels([chip('fast', 0)], geometry).map((l) => l.key);
    expect(keys).toEqual(expect.arrayContaining(['tick:-50', 'tick:50']));
    expect(keys).not.toContain('tick:0');
  });

  it('returns nothing before the chart has laid out', () => {
    expect(layoutMcbSideLabels([chip('fast', 0)], null)).toEqual([]);
  });
});

describe('mcbAxisTicks', () => {
  it('picks the smallest round step that keeps ticks readable', () => {
    expect(mcbAxisTicks(-110, 110, 156)).toEqual([-100, -50, 0, 50, 100]);
    expect(mcbAxisTicks(-110, 110, 600)).toEqual([-100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100]);
    expect(mcbAxisTicks(-12, 12, 156)).toEqual([-10, -5, 0, 5, 10]);
  });

  it('returns nothing for an empty range', () => {
    expect(mcbAxisTicks(0, 0, 100)).toEqual([]);
    expect(mcbAxisTicks(-10, 10, 0)).toEqual([]);
  });
});

describe('MCB visibility', () => {
  const labels = (visibility = MCB_DEFAULT_VISIBILITY) => {
    const panel = buildMcbPanelData(candlesFromCloses(sine(200)), visibility)!;
    return {
      datasets: panel.chartData.datasets.map((d: any) => d.label),
      chips: panel.sideValues.map((v) => v.key),
    };
  };

  const all = Object.fromEntries(
    Object.keys(MCB_DEFAULT_VISIBILITY).map((k) => [k, true]),
  ) as unknown as typeof MCB_DEFAULT_VISIBILITY;

  it('draws WaveTrend with its cross dots and money flow by default, without buy / sell signals', () => {
    const { datasets, chips } = labels();
    expect(datasets).toEqual(['mf+', 'mf-', 'fast', 'slow', 'crossUp', 'crossDown']);
    expect(chips).toEqual(['fast', 'slow', 'mf']);
  });

  it('draws every part when all are enabled', () => {
    const { datasets, chips } = labels(all);
    expect(datasets).toEqual([
      'mf+', 'mf-', 'fast', 'slow', 'vwap', 'rsi', 'stochD', 'stoch',
      'crossUp', 'crossDown', 'buy', 'sell',
    ]);
    expect(chips).toEqual(['fast', 'slow', 'mf', 'rsi', 'stoch']);
  });

  it('drops hidden parts together with their side chips', () => {
    const { datasets, chips } = labels({
      ...all,
      waveTrend: false,
      stochRsi: false,
      signals: false,
    });
    expect(datasets).toEqual(['mf+', 'mf-', 'vwap', 'rsi', 'crossUp', 'crossDown']);
    expect(chips).toEqual(['mf', 'rsi']);
  });

  it('keeps an invisible anchor dataset when everything is hidden', () => {
    const none = Object.fromEntries(
      Object.keys(MCB_DEFAULT_VISIBILITY).map((k) => [k, false]),
    ) as unknown as typeof MCB_DEFAULT_VISIBILITY;
    const { datasets, chips } = labels(none);
    expect(datasets).toEqual(['anchor']);
    expect(chips).toEqual([]);
  });

  it('normalizes persisted settings over the defaults', () => {
    expect(normalizeMcbVisibility(undefined)).toEqual(MCB_DEFAULT_VISIBILITY);
    expect(normalizeMcbVisibility({ rsi: true, vwap: 'no', bogus: false })).toEqual({
      ...MCB_DEFAULT_VISIBILITY,
      rsi: true,
    });
  });
});

describe('scaleMcbYRange', () => {
  it('zooms around the center of the range', () => {
    expect(scaleMcbYRange({ min: -110, max: 110 }, 0.5)).toEqual({ min: -55, max: 55 });
    expect(scaleMcbYRange({ min: 0, max: 100 }, 2)).toEqual({ min: -50, max: 150 });
  });

  it('clamps the span so the panel can never collapse or explode', () => {
    const tiny = scaleMcbYRange({ min: -1, max: 1 }, 0.01);
    expect(tiny.max - tiny.min).toBe(10);
    const huge = scaleMcbYRange({ min: -110, max: 110 }, 1000);
    expect(huge.max - huge.min).toBe(2000);
  });
});

describe('panMcbYRange', () => {
  it('moves the range with the drag, keeping its span', () => {
    // 100px plot showing 200 units: dragging down 25px reveals 50 units higher up.
    expect(panMcbYRange({ min: -100, max: 100 }, 25, 100)).toEqual({ min: -50, max: 150 });
    expect(panMcbYRange({ min: -100, max: 100 }, -50, 100)).toEqual({ min: -200, max: 0 });
  });

  it('ignores a zero drag or an unmeasured plot', () => {
    const range = { min: -110, max: 110 };
    expect(panMcbYRange(range, 0, 100)).toBe(range);
    expect(panMcbYRange(range, 10, 0)).toBe(range);
  });
});
