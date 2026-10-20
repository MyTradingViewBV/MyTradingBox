import { candlesInRange, computeFixedVolumeProfile } from './fixed-volume-profile';

describe('computeFixedVolumeProfile', () => {
  it('returns null for empty input', () => {
    expect(computeFixedVolumeProfile([])).toBeNull();
  });

  it('returns null when the range has no height (single flat candle)', () => {
    expect(computeFixedVolumeProfile([{ h: 5, l: 5, v: 100 }], 10)).toBeNull();
  });

  it('returns null when there is no volume', () => {
    expect(computeFixedVolumeProfile([{ h: 10, l: 0, v: 0 }], 10)).toBeNull();
  });

  it('spreads a single candle evenly over all rows', () => {
    const r = computeFixedVolumeProfile([{ h: 10, l: 0, v: 100 }], 10)!;
    expect(r.rangeLow).toBe(0);
    expect(r.rangeHigh).toBe(10);
    expect(r.rowHeight).toBe(1);
    expect(r.rowVolumes.every((v) => Math.abs(v - 10) < 1e-9)).toBe(true);
    expect(r.totalVolume).toBeCloseTo(100);
    // Ties keep the lowest row as POC; the value area grows upward on ties.
    expect(r.pocRow).toBe(0);
    expect(r.pocPrice).toBeCloseTo(0.5);
    expect(r.valueAreaLow).toBeCloseTo(0);
    expect(r.valueAreaHigh).toBeCloseTo(7);
  });

  it('puts a flat candle (high == low) fully into its row', () => {
    const r = computeFixedVolumeProfile(
      [
        { h: 10, l: 0, v: 10 },
        { h: 7.5, l: 7.5, v: 1000 },
      ],
      10,
    )!;
    expect(r.rowVolumes[7]).toBeCloseTo(1001);
    expect(r.pocRow).toBe(7);
    expect(r.pocPrice).toBeCloseTo(7.5);
  });

  it('computes POC / VAH / VAL for a known 3-candle example', () => {
    // Rows (height 1): 10 each from A, +100 in rows 4 and 5 from B, +50 in row 5 from C.
    // Total 350, POC row 5 (160); value area adds row 4 (110 > 10) -> 270 >= 245.
    const r = computeFixedVolumeProfile(
      [
        { h: 10, l: 0, v: 100 },
        { h: 6, l: 4, v: 200 },
        { h: 5, l: 5, v: 50 },
      ],
      10,
      70,
    )!;
    expect(r.totalVolume).toBeCloseTo(350);
    expect(r.rowVolumes[4]).toBeCloseTo(110);
    expect(r.rowVolumes[5]).toBeCloseTo(160);
    expect(r.rowVolumes[6]).toBeCloseTo(10);
    expect(r.pocRow).toBe(5);
    expect(r.pocPrice).toBeCloseTo(5.5);
    expect(r.valueAreaLow).toBeCloseTo(4);
    expect(r.valueAreaHigh).toBeCloseTo(6);
  });

  it('treats a missing volume as zero', () => {
    const r = computeFixedVolumeProfile(
      [
        { h: 10, l: 0 },
        { h: 2, l: 0, v: 10 },
      ],
      10,
    )!;
    expect(r.totalVolume).toBeCloseTo(10);
    expect(r.rangeHigh).toBe(10);
  });
});

describe('candlesInRange', () => {
  const candles = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }];

  it('keeps candles with open time inside the inclusive range', () => {
    expect(candlesInRange(candles, 2, 3).map((c) => c.x)).toEqual([2, 3]);
  });

  it('accepts bounds in either order', () => {
    expect(candlesInRange(candles, 3, 2).map((c) => c.x)).toEqual([2, 3]);
  });
});
