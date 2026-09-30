import {
  getTimeframeBucketStart,
  isCalendarTimeframe,
  normalizeTimeframe,
  timeframeToMilliseconds,
} from './timeframe-bucketing';

describe('timeframe utilities', () => {
  it('normalizes case but keeps 1M (month) distinct from 1m (minute)', () => {
    expect(normalizeTimeframe('1M')).toBe('1M');
    expect(normalizeTimeframe(' 1M ')).toBe('1M');
    expect(normalizeTimeframe('1m')).toBe('1m');
    expect(normalizeTimeframe('4H')).toBe('4h');
    expect(normalizeTimeframe('1W')).toBe('1w');
    expect(normalizeTimeframe('1M')).not.toBe(normalizeTimeframe('1m'));
    expect(isCalendarTimeframe('1M')).toBe(true);
    expect(isCalendarTimeframe('1m')).toBe(false);
  });

  it('converts app timeframes to milliseconds', () => {
    expect(timeframeToMilliseconds('1m')).toBe(60_000);
    expect(timeframeToMilliseconds('3m')).toBe(3 * 60_000);
    expect(timeframeToMilliseconds('5m')).toBe(5 * 60_000);
    expect(timeframeToMilliseconds('6m')).toBe(6 * 60_000);
    expect(timeframeToMilliseconds('15m')).toBe(15 * 60_000);
    expect(timeframeToMilliseconds('24m')).toBe(24 * 60_000);
    expect(timeframeToMilliseconds('30m')).toBe(30 * 60_000);
    expect(timeframeToMilliseconds('4h')).toBe(4 * 3_600_000);
    expect(timeframeToMilliseconds('1d')).toBe(86_400_000);
    expect(timeframeToMilliseconds('3d')).toBe(3 * 86_400_000);
    expect(timeframeToMilliseconds('1w')).toBe(7 * 86_400_000);
    expect(timeframeToMilliseconds('bogus')).toBe(0);
    expect(timeframeToMilliseconds('')).toBe(0);
  });

  it('treats 1M as a calendar month', () => {
    expect(timeframeToMilliseconds('1M')).toBe(30 * 86_400_000);
    expect(timeframeToMilliseconds('1M', Date.UTC(2026, 1, 10))).toBe(28 * 86_400_000);
    expect(timeframeToMilliseconds('1M', Date.UTC(2026, 0, 31, 23))).toBe(31 * 86_400_000);
    expect(getTimeframeBucketStart(Date.UTC(2026, 8, 30, 12), '1M')).toBe(Date.UTC(2026, 8, 1));
  });
});
