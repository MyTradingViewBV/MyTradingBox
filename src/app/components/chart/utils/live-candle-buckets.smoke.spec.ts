import { SymbolCandleAggregator } from './symbol-candle-aggregator';
import { mergeLiveCandle, timeframeToPeriodMs } from './merge-live-candles';
import { toBitvavoMarket } from '../services/bitvavo-stream.service';
import {
  binanceMarketForExchange,
  binanceMiniTickerUrl,
  isBinanceExchangeId,
  sanitizeStreamSymbol,
} from './binance-market';

const live = (openTime: number, close: number, volume = 1) => ({
  openTime,
  closeTime: openTime + 60_000,
  open: close,
  high: close,
  low: close,
  close,
  volume,
});

describe('live candle calendar buckets', () => {
  it('appends a March bar after February 2027 for 1M (fixed 30d periods collide)', () => {
    const feb = Date.UTC(2027, 1, 1);
    const marTick = Date.UTC(2027, 2, 1, 0, 5);
    const candles = [{ x: feb, o: 1, h: 1, l: 1, c: 1, v: 1 }];

    const merged = mergeLiveCandle(candles, live(marTick, 2), {
      periodMs: timeframeToPeriodMs('1M'),
    });
    expect(merged.length).toBe(2);
    expect(merged[1].x).toBe(marTick);

    const withTimeframe = mergeLiveCandle(candles, live(marTick, 2), { timeframe: '1M' });
    expect(withTimeframe.length).toBe(2);
  });

  it('updates the February 1M bar in place for a late-February tick', () => {
    const feb = Date.UTC(2027, 1, 1);
    const candles = [{ x: feb, o: 1, h: 1, l: 1, c: 1, v: 1 }];
    const merged = mergeLiveCandle(candles, live(Date.UTC(2027, 1, 27, 12), 3), {
      periodMs: timeframeToPeriodMs('1M'),
    });
    expect(merged.length).toBe(1);
    expect(merged[0]).toMatchObject({ x: feb, c: 3, h: 3 });
    expect(merged).not.toBe(candles);
    expect(candles[0].c).toBe(1);
  });

  it('buckets 1w by Monday UTC boundaries', () => {
    const monday = Date.UTC(2026, 8, 7); // Monday 2026-09-07
    const candles = [{ x: monday, o: 1, h: 1, l: 1, c: 1, v: 1 }];

    const sunday = Date.UTC(2026, 8, 13, 23, 59);
    const sameWeek = mergeLiveCandle(candles, live(sunday, 2), {
      periodMs: timeframeToPeriodMs('1w'),
    });
    expect(sameWeek.length).toBe(1);

    const nextMonday = Date.UTC(2026, 8, 14);
    const nextWeek = mergeLiveCandle(candles, live(nextMonday, 3), { timeframe: '1w' });
    expect(nextWeek.length).toBe(2);
    expect(nextWeek[1].x).toBe(nextMonday);
  });

  it('returns the same reference for stale ticks', () => {
    const candles = [{ x: Date.UTC(2026, 8, 7, 10), o: 1, h: 1, l: 1, c: 1, v: 1 }];
    const merged = mergeLiveCandle(candles, live(Date.UTC(2026, 8, 7, 8), 2), {
      periodMs: timeframeToPeriodMs('1h'),
    });
    expect(merged).toBe(candles);
  });
});

describe('symbol candle aggregator ordering and seeding', () => {
  const bucketStart = Date.UTC(2026, 8, 7, 16, 0, 0);
  const minute = (m: number, close: number, volume: number) => ({
    time: bucketStart + m * 60_000,
    open: close,
    high: close,
    low: close,
    close,
    volume,
  });

  it('ignores an out-of-order update from an older bucket', () => {
    const aggregator = new SymbolCandleAggregator();
    aggregator.update('BTCUSDT', minute(65, 200, 5), false, ['1h']);

    const late = aggregator.update('BTCUSDT', minute(59, 100, 9), true, ['1h']);
    expect(late).toEqual([]);

    const next = aggregator.update('BTCUSDT', minute(66, 201, 2), false, ['1h']);
    expect(next[next.length - 1]).toMatchObject({
      openTime: bucketStart + 60 * 60_000,
      open: 200,
      close: 201,
      low: 200,
      volume: 7,
    });
  });

  it('ignores a late older minute inside the current bucket', () => {
    const aggregator = new SymbolCandleAggregator();
    aggregator.update('BTCUSDT', minute(1, 100, 4), false, ['1h']);
    aggregator.update('BTCUSDT', minute(2, 110, 3), false, ['1h']);
    const late = aggregator.update('BTCUSDT', minute(1, 90, 6), true, ['1h']);
    expect(late).toEqual([]);

    const next = aggregator.update('BTCUSDT', minute(2, 111, 5), false, ['1h']);
    expect(next[0]).toMatchObject({ close: 111, low: 100, volume: 9 });
  });

  it('does not double-count the forming minute included in the seed', () => {
    const aggregator = new SymbolCandleAggregator();
    const now = bucketStart + 3 * 60_000 + 30_000; // minute 3 is still forming

    aggregator.seed(
      '1h',
      [minute(0, 100, 10), minute(1, 101, 10), minute(2, 102, 10), minute(3, 103, 4)],
      now,
    );

    const update = aggregator.update('BTCUSDT', minute(3, 104, 6), false, ['1h']);
    expect(update[0]).toMatchObject({
      openTime: bucketStart,
      open: 100,
      close: 104,
      volume: 36,
    });
  });

  it('seeds a large bucket from a single target-timeframe candle', () => {
    const aggregator = new SymbolCandleAggregator();
    const month = Date.UTC(2026, 8, 1);
    aggregator.seedBucket('1M', {
      time: month,
      open: 50,
      high: 70,
      low: 40,
      close: 60,
      volume: 1000,
    });
    const tick = Date.UTC(2026, 8, 30, 12, 0);
    const update = aggregator.update(
      'BTCUSDT',
      { time: tick, open: 61, high: 75, low: 61, close: 74, volume: 3 },
      false,
      ['1M'],
    );
    expect(update[0]).toMatchObject({
      openTime: month,
      open: 50,
      high: 75,
      low: 40,
      close: 74,
      volume: 1003,
    });
  });
});

describe('exchange symbol mapping', () => {
  it('maps app symbols to Bitvavo markets', () => {
    expect(toBitvavoMarket('BTCEUR')).toBe('BTC-EUR');
    expect(toBitvavoMarket('ethusdc')).toBe('ETH-USDC');
    expect(toBitvavoMarket('SOLUSDT')).toBe('SOL-USDT');
    expect(toBitvavoMarket('ETHBTC')).toBe('ETH-BTC');
    expect(toBitvavoMarket('BTC-EUR')).toBe('BTC-EUR');
    expect(toBitvavoMarket('EUR')).toBe('EUR');
  });

  it('maps both Binance exchange ids to USDT-M futures streams', () => {
    expect(isBinanceExchangeId(2)).toBe(true);
    expect(isBinanceExchangeId(7)).toBe(true);
    expect(isBinanceExchangeId(1)).toBe(false);
    expect(binanceMarketForExchange(2)).toBe('futures');
    expect(binanceMarketForExchange(7)).toBe('futures');
    expect(binanceMiniTickerUrl('futures', ['BTCUSDT', 'ETHUSDT'])).toBe(
      'wss://fstream.binance.com/stream?streams=btcusdt@miniTicker/ethusdt@miniTicker',
    );
    expect(binanceMiniTickerUrl('spot', ['BTCUSDT'])).toBe(
      'wss://stream.binance.com:9443/stream?streams=btcusdt@miniTicker',
    );
  });

  it('rejects symbols that are unsafe in stream URLs', () => {
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      expect(sanitizeStreamSymbol(' btcusdt ')).toBe('BTCUSDT');
      expect(sanitizeStreamSymbol('PF_XBTUSD')).toBe('PF_XBTUSD');
      expect(sanitizeStreamSymbol('BTC/USDT')).toBeNull();
      expect(sanitizeStreamSymbol('btc&streams=x')).toBeNull();
    } finally {
      console.warn = warn;
    }
  });
});
