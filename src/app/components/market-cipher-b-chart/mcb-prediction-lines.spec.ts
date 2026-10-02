import {
  DivergenceLinePrediction,
  TimeframePrediction,
  buildPredictionDatasets,
  findTimeframePrediction,
  mapPredictionLines,
  parseTimeframeResults,
} from './mcb-prediction-lines';

const T0 = Date.UTC(2026, 9, 1, 0, 0, 0);
const HOUR = 3_600_000;
const candles = Array.from({ length: 10 }, (_, i) => ({ x: T0 + i * HOUR }));

function line(overrides: Partial<DivergenceLinePrediction> = {}): DivergenceLinePrediction {
  return {
    Source: 'Wave',
    IsBear: true,
    PivotRank: 1,
    ScorePct: 85,
    AnchorOscBarIndex: 2494,
    AnchorOscValue: 60,
    CurrentOscBarIndex: 2498,
    CurrentOscValue: 45,
    AnchorPriceBarIndex: 2494,
    AnchorPriceValue: 100,
    CurrentPriceBarIndex: 2499,
    CurrentPriceValue: 110,
    ...overrides,
  };
}

function prediction(lines: DivergenceLinePrediction[], candleTime?: string): TimeframePrediction {
  return { Timeframe: '1h', CandleTime: candleTime ?? '', DivergenceLines: lines };
}

describe('mcb-prediction-lines', () => {
  it('parses TimeframeResults sent as a JSON string', () => {
    const results = parseTimeframeResults({
      TimeframeResults: JSON.stringify([{ Timeframe: '1h', DivergenceLines: [] }]),
    });
    expect(results.length).toBe(1);
    expect(parseTimeframeResults({ TimeframeResults: 'not json' })).toEqual([]);
    expect(parseTimeframeResults(null)).toEqual([]);
  });

  it('matches timeframes case-sensitively', () => {
    const results = [
      { Timeframe: '1m', CandleTime: '', DivergenceLines: [] },
      { Timeframe: '1M', CandleTime: '', DivergenceLines: [] },
    ];
    expect(findTimeframePrediction(results, '1M')).toBe(results[1]);
    expect(findTimeframePrediction(results, '4h')).toBeNull();
  });

  it('maps bot bar indexes relative to the latest price bar onto the last candle', () => {
    const [mapped] = mapPredictionLines(prediction([line()]), candles);
    // Max CurrentPriceBarIndex 2499 = last candle (index 9).
    expect(mapped.price).toEqual({ x1: candles[4].x, y1: 100, x2: candles[9].x, y2: 110 });
    expect(mapped.osc).toEqual({ x1: candles[4].x, y1: 60, x2: candles[8].x, y2: 45 });
    expect(mapped.isBear).toBe(true);
    expect(mapped.isMoneyFlow).toBe(false);
  });

  it('anchors on CandleTime when the chart is ahead of the bot', () => {
    const [mapped] = mapPredictionLines(
      prediction([line()], new Date(candles[7].x).toISOString().replace('Z', '')),
      candles,
    );
    expect(mapped.price?.x2).toBe(candles[7].x);
    expect(mapped.price?.x1).toBe(candles[2].x);
  });

  it('drops segments whose anchor is before the loaded candles', () => {
    const lines = mapPredictionLines(
      prediction([line({ AnchorOscBarIndex: 2400, AnchorPriceBarIndex: 2400 })]),
      candles,
    );
    expect(lines).toEqual([]);
  });

  it('finds the last bot bar from the price pivots when the current pivot is not the last bar', () => {
    // Bot list ends at bar 2499 = last candle; the current bear pivot is 3 bars earlier.
    const ohlc = Array.from({ length: 12 }, (_, i) => ({ x: T0 + i * HOUR, h: 100 + i, l: 90 + i, c: 95 + i }));
    ohlc[2].h = 120; // anchor top, bot bar 2490
    ohlc[8].h = 125; // current top, bot bar 2496
    const [mapped] = mapPredictionLines(
      prediction([
        line({
          AnchorPriceBarIndex: 2490,
          AnchorPriceValue: 120,
          CurrentPriceBarIndex: 2496,
          CurrentPriceValue: 125,
          AnchorOscBarIndex: 2490,
          CurrentOscBarIndex: 2496,
        }),
      ]),
      ohlc,
    );
    expect(mapped.price).toEqual({ x1: ohlc[2].x, y1: 120, x2: ohlc[8].x, y2: 125 });
    expect(mapped.osc?.x1).toBe(ohlc[2].x);
    expect(mapped.osc?.x2).toBe(ohlc[8].x);
  });

  it('snaps line ends onto the wicks and the panel curves', () => {
    const ohlc = Array.from({ length: 10 }, (_, i) => ({ x: T0 + i * HOUR, h: 200 + i, l: 100 + i, c: 150 }));
    const osc = {
      x: ohlc.map((c) => c.x),
      wt1: ohlc.map((_, i) => -50 + i),
      mf: ohlc.map((_, i) => -5 - i),
    };
    const lines = mapPredictionLines(
      prediction([
        // Bull: price slightly off the lows (other data source), osc on the bot's own scale.
        line({ IsBear: false, AnchorPriceValue: 104.01, CurrentPriceValue: 109.02, AnchorOscValue: -61, CurrentOscValue: -40 }),
        line({ Source: 'MoneyFlow', IsBear: false, AnchorPriceValue: 104, CurrentPriceValue: 109, AnchorOscValue: -0.3, CurrentOscValue: -0.1 }),
      ]),
      ohlc,
      osc,
    );
    expect(lines[0].price).toEqual({ x1: ohlc[4].x, y1: 104, x2: ohlc[9].x, y2: 109 });
    expect(lines[0].osc).toEqual({ x1: ohlc[4].x, y1: -46, x2: ohlc[8].x, y2: -42 });
    expect(lines[1].osc).toEqual({ x1: ohlc[4].x, y1: -9, x2: ohlc[8].x, y2: -13 });
  });

  it('dashes Money Flow lines and labels the score', () => {
    const lines = mapPredictionLines(prediction([line({ Source: 'MoneyFlow', IsBear: false })]), candles);
    const [ds] = buildPredictionDatasets(lines, 'price');
    expect(ds.isMcbPrediction).toBe(true);
    expect(ds.borderDash.length).toBeGreaterThan(0);
    expect(ds.mcbPredLabel).toBe('85.0%');
    expect(ds.yAxisID).toBe('y');
    const [osc] = buildPredictionDatasets(lines, 'osc');
    expect(osc.yAxisID).toBeUndefined();
  });
});
