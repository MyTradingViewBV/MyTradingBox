import {
  TimeframeTrendlines,
  TrendlineLine,
  TRENDLINE_STYLES,
  buildTrendlineDatasets,
  findTimeframeTrendlines,
  parseTimeframeResults,
} from './mcb-trendlines';

const T0 = Date.UTC(2026, 9, 1);
const H = 3_600_000;

function line(overrides: Partial<TrendlineLine> = {}): TrendlineLine {
  return {
    Id: `${T0}-${T0 + 4 * H}:Dominant`,
    Role: 'Dominant',
    IsConfirmed: true,
    IsVisible: true,
    Regime: 'Positive',
    Osc: { T1: T0, V1: -60, T2: T0 + 4 * H, V2: -40, EndT: T0 + 6 * H, EndV: -30 },
    Price: { T1: T0, P1: 100, T2: T0 + 4 * H, P2: 108, EndT: T0 + 6 * H, EndP: 112, Kind1: 'Low', Kind2: 'Low' },
    ...overrides,
  };
}

function tl(lines: TrendlineLine[]): TimeframeTrendlines {
  return {
    Version: 1,
    EndTimeMs: T0 + 6 * H,
    ClosedCount: 100,
    Regime: 'Positive',
    StructureStatus: 'Established',
    Dominant: null,
    PendingDominant: null,
    Internal: [],
    Lines: lines,
  };
}

describe('mcb-trendlines', () => {
  it('parses TimeframeResults sent as a JSON string or array', () => {
    expect(parseTimeframeResults({ TimeframeResults: JSON.stringify([{ Timeframe: '1h' }]) }).length).toBe(1);
    expect(parseTimeframeResults({ timeframeResults: [{ Timeframe: '1h' }] }).length).toBe(1);
    expect(parseTimeframeResults({ TimeframeResults: 'not json' })).toEqual([]);
    expect(parseTimeframeResults(null)).toEqual([]);
  });

  describe('findTimeframeTrendlines', () => {
    const a = tl([line()]);
    const b = tl([]);
    const results = [
      { Timeframe: '1m', Trendlines: a },
      { Timeframe: '1M', Trendlines: b },
      { Timeframe: '1h', Trendlines: null },
    ];

    it('matches exactly and case-sensitively (1m vs 1M)', () => {
      expect(findTimeframeTrendlines(results, '1m')).toBe(a);
      expect(findTimeframeTrendlines(results, '1M')).toBe(b);
    });

    it('never falls back to another timeframe', () => {
      expect(findTimeframeTrendlines(results, '12m')).toBeNull();
      expect(findTimeframeTrendlines(results, '3m')).toBeNull();
      expect(findTimeframeTrendlines([{ Timeframe: '1m', Trendlines: a }], '1M')).toBeNull();
    });

    it('is null when Trendlines is missing/null or results are empty', () => {
      expect(findTimeframeTrendlines(results, '1h')).toBeNull();
      expect(findTimeframeTrendlines([{ Timeframe: '5m' }], '5m')).toBeNull();
      expect(findTimeframeTrendlines([], '1m')).toBeNull();
      expect(findTimeframeTrendlines(null, '1m')).toBeNull();
    });
  });

  describe('buildTrendlineDatasets', () => {
    it('draws T1 -> T2 and extends along the own slope to extendToX (osc)', () => {
      const [ds] = buildTrendlineDatasets(tl([line()]), 'osc', { extendToX: T0 + 8 * H });
      // slope = 20 / 4h = 5 per hour; value at +8h = -40 + 5 * 4
      expect(ds.data).toEqual([
        { x: T0, y: -60 },
        { x: T0 + 4 * H, y: -40 },
        { x: T0 + 8 * H, y: -20 },
      ]);
      expect(ds.isMcbTrendline).toBe(true);
      expect(ds.order).toBe(-2);
      expect(ds.xAxisID).toBeUndefined();
    });

    it('defaults the extension to EndT and uses the line slope, not EndV', () => {
      const [ds] = buildTrendlineDatasets(tl([line()]), 'osc');
      expect(ds.data[2]).toEqual({ x: T0 + 6 * H, y: -30 });
      const skewed = line({ Osc: { T1: T0, V1: 0, T2: T0 + 2 * H, V2: 10, EndT: T0 + 4 * H, EndV: 999 } });
      expect(buildTrendlineDatasets(tl([skewed]), 'osc')[0].data[2]).toEqual({ x: T0 + 4 * H, y: 20 });
    });

    it('does not add an extension point when the chart ends before T2', () => {
      const [ds] = buildTrendlineDatasets(tl([line()]), 'osc', { extendToX: T0 + 2 * H });
      expect(ds.data.length).toBe(2);
    });

    it('price pane uses Price values, axes x/y and order 850', () => {
      const [ds] = buildTrendlineDatasets(tl([line()]), 'price', { extendToX: T0 + 8 * H });
      expect(ds.data).toEqual([
        { x: T0, y: 100 },
        { x: T0 + 4 * H, y: 108 },
        { x: T0 + 8 * H, y: 116 },
      ]);
      expect(ds.xAxisID).toBe('x');
      expect(ds.yAxisID).toBe('y');
      expect(ds.order).toBe(850);
    });

    it('skips lines without Price on the price pane only', () => {
      const t = tl([line({ Price: null })]);
      expect(buildTrendlineDatasets(t, 'price')).toEqual([]);
      expect(buildTrendlineDatasets(t, 'osc').length).toBe(1);
    });

    it('skips hidden lines', () => {
      expect(buildTrendlineDatasets(tl([line({ IsVisible: false })]), 'osc')).toEqual([]);
    });

    it('skips null / non-finite values and degenerate lines', () => {
      const bad = [
        line({ Osc: { T1: T0, V1: null, T2: T0 + H, V2: 1, EndT: T0, EndV: 1 } }),
        line({ Osc: { T1: T0, V1: 1, T2: T0 + H, V2: NaN, EndT: T0, EndV: 1 } }),
        line({ Osc: { T1: T0, V1: 1, T2: Infinity, V2: 1, EndT: T0, EndV: 1 } }),
        line({ Osc: { T1: T0, V1: 1, T2: T0, V2: 2, EndT: T0, EndV: 1 } }),
        line({ Osc: null }),
      ];
      expect(buildTrendlineDatasets(tl(bad), 'osc')).toEqual([]);
      expect(buildTrendlineDatasets(tl([bad[0], line()]), 'osc').length).toBe(1);
    });

    it('styles: purple osc / brown price, dominant thicker than internal', () => {
      const t = tl([line(), line({ Role: 'Internal', Id: 'i' })]);
      const [osc1, osc2] = buildTrendlineDatasets(t, 'osc');
      expect(osc1.borderColor).toBe(TRENDLINE_STYLES.osc.dominant.color);
      expect(osc1.borderWidth).toBe(2);
      expect(osc2.borderColor).toBe('rgba(186,85,211,0.55)');
      expect(osc2.borderWidth).toBe(1);
      const [p1, p2] = buildTrendlineDatasets(t, 'price');
      expect(p1.borderColor).toBe('rgba(165,110,60,0.95)');
      expect(p2.borderColor).toBe('rgba(165,110,60,0.6)');
      expect(p2.borderWidth).toBe(1.2);
      expect(osc1.borderDash).toEqual([]);
    });

    it('developing lines are dashed and only drawn when the toggle is on', () => {
      const t = tl([line({ Role: 'Developing', Id: 'd' })]);
      const [ds] = buildTrendlineDatasets(t, 'osc', { showDeveloping: true });
      expect(ds.borderDash).toEqual([4, 4]);
      expect(buildTrendlineDatasets(t, 'osc')[0].borderDash).toEqual([4, 4]);
      expect(buildTrendlineDatasets(t, 'osc', { showDeveloping: false })).toEqual([]);
      expect(buildTrendlineDatasets(t, 'price', { showDeveloping: false })).toEqual([]);
    });

    it('anchor dots only on T1/T2 and only when requested', () => {
      const [off] = buildTrendlineDatasets(tl([line()]), 'osc');
      expect(off.pointRadius).toEqual([0, 0, 0]);
      const [on] = buildTrendlineDatasets(tl([line()]), 'osc', { anchorRadius: 3 });
      expect(on.pointRadius).toEqual([3, 3, 0]);
    });

    it('handles null trendlines', () => {
      expect(buildTrendlineDatasets(null, 'osc')).toEqual([]);
    });
  });
});
