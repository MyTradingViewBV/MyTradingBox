import {
  ShortSymbolNamePipe,
  SignalChipClassPipe,
  SignalTierPipe,
} from './watchlist-signal.pipes';

describe('SignalChipClassPipe', () => {
  const pipe = new SignalChipClassPipe();

  it('marks missing/neutral signals inactive', () => {
    expect(pipe.transform(undefined)).toBe('tv-signal-chip inactive');
    expect(pipe.transform('')).toBe('tv-signal-chip inactive');
    expect(pipe.transform('gold')).toBe('tv-signal-chip inactive');
  });

  it('adds tier + bull direction (case-insensitive)', () => {
    expect(pipe.transform('Gold Bullish')).toBe('tv-signal-chip tier-gold dir-bull');
    expect(pipe.transform('BULL')).toBe('tv-signal-chip tier-unknown dir-bull');
  });

  it('adds tier + bear direction', () => {
    expect(pipe.transform('diamond_bearish')).toBe('tv-signal-chip tier-diamond dir-bear');
  });

  it('prefers bull when both directions appear', () => {
    expect(pipe.transform('silver bull/bear')).toBe('tv-signal-chip tier-silver dir-bull');
  });
});

describe('SignalTierPipe', () => {
  const pipe = new SignalTierPipe();

  it('extracts each tier case-insensitively', () => {
    expect(pipe.transform('Bronze Bullish')).toBe('bronze');
    expect(pipe.transform('SILVER')).toBe('silver');
    expect(pipe.transform('gold_bear')).toBe('gold');
    expect(pipe.transform('Platinum')).toBe('platinum');
    expect(pipe.transform('diamond')).toBe('diamond');
  });

  it('uses the first matching tier in bronze → diamond order', () => {
    expect(pipe.transform('diamond bronze')).toBe('bronze');
  });

  it('returns unknown for missing/unrecognised input', () => {
    expect(pipe.transform(undefined)).toBe('unknown');
    expect(pipe.transform('')).toBe('unknown');
    expect(pipe.transform('bullish')).toBe('unknown');
  });
});

describe('ShortSymbolNamePipe', () => {
  const pipe = new ShortSymbolNamePipe();

  it('replaces DOMINANCE (any case, every occurrence) with -D', () => {
    expect(pipe.transform('BTCDOMINANCE')).toBe('BTC-D');
    expect(pipe.transform('usdtDominance')).toBe('usdt-D');
    expect(pipe.transform('DOMINANCEDOMINANCE')).toBe('-D-D');
  });

  it('leaves other names unchanged', () => {
    expect(pipe.transform('ETHUSDT')).toBe('ETHUSDT');
  });

  it('stringifies a numeric symbol-id fallback (including 0)', () => {
    expect(pipe.transform(42)).toBe('42');
    expect(pipe.transform(0)).toBe('0');
  });

  it('returns an empty string for null/undefined/empty', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });
});
