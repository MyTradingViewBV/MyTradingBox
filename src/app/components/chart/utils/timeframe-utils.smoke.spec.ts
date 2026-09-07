import {
  isValidBinanceInterval,
  mapTimeframeToBinanceInterval,
  timeframeToPeriodMs,
} from './merge-live-candles';
import { dominanceTimeframeToPeriodMs } from './custom-timeframe-live';

describe('timeframe utilities', () => {
  it('keeps 1m and 3m as native Binance intervals', () => {
    expect(isValidBinanceInterval('1m')).toBe(true);
    expect(isValidBinanceInterval('3m')).toBe(true);
    expect(mapTimeframeToBinanceInterval('1m')).toBe('1m');
    expect(mapTimeframeToBinanceInterval('3m')).toBe('3m');
  });

  it('treats 6m as a custom timeframe', () => {
    expect(isValidBinanceInterval('6m')).toBe(false);
    expect(mapTimeframeToBinanceInterval('6m')).toBeNull();
    expect(timeframeToPeriodMs('6m')).toBe(6 * 60_000);
  });

  it('uses matching periods for dominance calculations', () => {
    expect(dominanceTimeframeToPeriodMs('1m')).toBe(60_000);
    expect(dominanceTimeframeToPeriodMs('3m')).toBe(3 * 60_000);
    expect(dominanceTimeframeToPeriodMs('6m')).toBe(6 * 60_000);
  });
});