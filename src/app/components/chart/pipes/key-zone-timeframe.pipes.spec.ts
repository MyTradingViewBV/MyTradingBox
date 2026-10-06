import {
  KeyZoneTimeframeEnabledPipe,
  KeyZoneTimeframeLabelPipe,
} from './key-zone-timeframe.pipes';

describe('KeyZoneTimeframeLabelPipe', () => {
  const pipe = new KeyZoneTimeframeLabelPipe();

  it('keeps minutes lowercase', () => {
    expect(pipe.transform('1m')).toBe('1m');
    expect(pipe.transform('15m')).toBe('15m');
    expect(pipe.transform('15M')).toBe('15m');
  });

  it('keeps the month as 1M (distinct from the 1m minute)', () => {
    expect(pipe.transform('1M')).toBe('1M');
    expect(pipe.transform(' 1M ')).toBe('1M');
  });

  it('upper-cases hours, days and weeks', () => {
    expect(pipe.transform('4h')).toBe('4H');
    expect(pipe.transform('4H')).toBe('4H');
    expect(pipe.transform('1d')).toBe('1D');
    expect(pipe.transform('1w')).toBe('1W');
  });

  it('handles empty input', () => {
    expect(pipe.transform('')).toBe('');
  });
});

describe('KeyZoneTimeframeEnabledPipe', () => {
  const pipe = new KeyZoneTimeframeEnabledPipe();
  const flags = { '1M': true, '1m': false, '4h': true, '1d': false };

  it('looks up the normalized timeframe key', () => {
    expect(pipe.transform('4H', flags)).toBe(true);
    expect(pipe.transform('4h', flags)).toBe(true);
    expect(pipe.transform('1d', flags)).toBe(false);
  });

  it('keeps month and minute distinct', () => {
    expect(pipe.transform('1M', flags)).toBe(true);
    expect(pipe.transform('1m', flags)).toBe(false);
  });

  it('returns false for unknown or empty timeframes', () => {
    expect(pipe.transform('1w', flags)).toBe(false);
    expect(pipe.transform('', { '': true })).toBe(false);
    expect(pipe.transform('4h', {})).toBe(false);
  });
});
