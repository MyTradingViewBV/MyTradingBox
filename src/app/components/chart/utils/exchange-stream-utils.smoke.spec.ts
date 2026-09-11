import { SymbolCandleAggregator } from './symbol-candle-aggregator';
import { seedCustomTimeframeLiveCandle } from './merge-live-candles';
import {
  getTimeframeBucketEnd,
  getTimeframeBucketStart,
  parseTimeframeMinutes,
} from './timeframe-bucketing';

describe('exchange stream utilities', () => {
  it('matches Bots-style minute, hour, and calendar buckets', () => {
    const time = Date.UTC(2026, 8, 7, 9, 23, 45);

    expect(parseTimeframeMinutes('4h')).toBe(240);
    expect(getTimeframeBucketStart(time, '6m')).toBe(Date.UTC(2026, 8, 7, 9, 18, 0));
    expect(getTimeframeBucketStart(time, '4h')).toBe(Date.UTC(2026, 8, 7, 8, 0, 0));
    expect(getTimeframeBucketStart(time, '1d')).toBe(Date.UTC(2026, 8, 7, 0, 0, 0));
    expect(getTimeframeBucketStart(time, '1w')).toBe(Date.UTC(2026, 8, 7, 0, 0, 0));
    expect(getTimeframeBucketStart(time, '1M')).toBe(Date.UTC(2026, 8, 1, 0, 0, 0));
    expect(getTimeframeBucketEnd(Date.UTC(2026, 8, 1), '1M')).toBe(Date.UTC(2026, 9, 1));
  });

  it('aggregates one-minute candles into selected live timeframes', () => {
    const aggregator = new SymbolCandleAggregator();
    const start = Date.UTC(2026, 8, 7, 9, 0, 0);

    const first = aggregator.update(
      'BTCUSDT',
      { time: start, open: 100, high: 105, low: 99, close: 104, volume: 10 },
      true,
      ['3m'],
    );
    expect(first[first.length - 1]).toMatchObject({
      interval: '3m',
      openTime: start,
      open: 100,
      high: 105,
      low: 99,
      close: 104,
      volume: 10,
      isClosed: false,
    });

    aggregator.update(
      'BTCUSDT',
      { time: start + 60_000, open: 104, high: 108, low: 103, close: 107, volume: 20 },
      true,
      ['3m'],
    );
    const third = aggregator.update(
      'BTCUSDT',
      { time: start + 120_000, open: 107, high: 109, low: 102, close: 103, volume: 30 },
      true,
      ['3m'],
    );

    expect(third[third.length - 1]).toMatchObject({
      interval: '3m',
      openTime: start,
      open: 100,
      high: 109,
      low: 99,
      close: 103,
      volume: 60,
      isClosed: true,
    });
  });

  it('replaces the stale current bucket when the same-hour seed arrives', () => {
    const aggregator = new SymbolCandleAggregator();
    const bucketStart = Date.UTC(2026, 8, 7, 16, 0, 0);

    aggregator.update(
      'BTCUSDT',
      { time: bucketStart + 10 * 60_000, open: 500, high: 510, low: 495, close: 505, volume: 5 },
      false,
      ['1h'],
    );

    aggregator.seed('1h', [
      { time: bucketStart, open: 100, high: 102, low: 99, close: 101, volume: 10 },
      { time: bucketStart + 60_000, open: 101, high: 104, low: 100, close: 103, volume: 12 },
      { time: bucketStart + 2 * 60_000, open: 103, high: 105, low: 101, close: 104, volume: 9 },
      { time: bucketStart + 3 * 60_000, open: 104, high: 106, low: 102, close: 105, volume: 11 },
    ]);

    const update = aggregator.update(
      'BTCUSDT',
      { time: bucketStart + 10 * 60_000, open: 501, high: 512, low: 499, close: 510, volume: 7 },
      false,
      ['1h'],
    );

    expect(update[0]).toMatchObject({
      interval: '1h',
      openTime: bucketStart,
      open: 100,
      high: 512,
      low: 99,
      close: 510,
      isClosed: false,
    });
  });

  it('seeds the custom timeframe candle from the first 1m candle in the current period', () => {
    const periodStart = Date.UTC(2026, 8, 7, 8, 0, 0);
    const seed = seedCustomTimeframeLiveCandle(periodStart, {
      open: 100,
      high: 105,
      low: 99,
      close: 103,
      volume: 12,
    });

    expect(seed).toMatchObject({
      x: periodStart,
      o: 100,
      h: 105,
      l: 99,
      c: 103,
      v: 12,
    });
  });
});
