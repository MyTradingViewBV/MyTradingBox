import { ProfitPctPipe, RrRatioPipe } from './order-metrics.pipes';

describe('ProfitPctPipe', () => {
  const pipe = new ProfitPctPipe();

  it('formats a positive profit with a + sign', () => {
    // 50 / (100 * 2) = 25%
    expect(pipe.transform(50, 100, 2)).toBe('(+25.00%)');
  });

  it('formats a negative profit', () => {
    expect(pipe.transform(-12.345, 1000, 1)).toBe('(-1.23%)');
  });

  it('treats zero profit as +0.00%', () => {
    expect(pipe.transform(0, 100, 1)).toBe('(+0.00%)');
  });

  it('returns empty when there is no entry price', () => {
    expect(pipe.transform(50, 0, 2)).toBe('');
    expect(pipe.transform(50, undefined as unknown as number, 2)).toBe('');
  });

  it('clamps leverage below 1 to 1', () => {
    expect(pipe.transform(10, 100, 0.5)).toBe('(+10.00%)');
    expect(pipe.transform(10, 100, 0)).toBe('(+10.00%)');
    expect(pipe.transform(10, 100, null as unknown as number)).toBe('(+10.00%)');
  });

  it('falls back to the draft leverage only when leverage is undefined', () => {
    expect(pipe.transform(50, 100, undefined, 5)).toBe('(+10.00%)');
    expect(pipe.transform(50, 100, 2, 5)).toBe('(+25.00%)');
  });

  it('uses leverage 1 when both leverage and fallback are missing/invalid', () => {
    expect(pipe.transform(10, 100, undefined)).toBe('(+10.00%)');
    expect(pipe.transform(10, 100, undefined, 0)).toBe('(+10.00%)');
    expect(pipe.transform(10, 100, undefined, NaN)).toBe('(+10.00%)');
  });
});

describe('RrRatioPipe', () => {
  const pipe = new RrRatioPipe();

  it('computes reward / risk for a long', () => {
    // entry 100, tp 130 (+30), sl 90 (-10) → 3
    expect(pipe.transform(100, 130, 90, 'long')).toBe(3);
  });

  it('computes reward / risk for a short', () => {
    // entry 100, tp 80 (+20), sl 110 (-10) → 2
    expect(pipe.transform(100, 80, 110, 'short')).toBe(2);
  });

  it('defaults to long when side is missing', () => {
    expect(pipe.transform(100, 130, 90, undefined)).toBe(3);
    expect(pipe.transform(100, 130, 90, null)).toBe(3);
  });

  it('returns 0 without risk (no stop loss, or stop loss on the wrong side)', () => {
    expect(pipe.transform(100, 130, undefined, 'long')).toBe(0);
    expect(pipe.transform(100, 130, null, 'long')).toBe(0);
    expect(pipe.transform(100, 130, 100, 'long')).toBe(0);
    expect(pipe.transform(100, 130, 110, 'long')).toBe(0);
  });

  it('clamps a negative reward to 0', () => {
    expect(pipe.transform(100, 90, 95, 'long')).toBe(0);
  });
});
