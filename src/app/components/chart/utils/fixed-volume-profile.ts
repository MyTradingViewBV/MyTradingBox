/**
 * Fixed Range Volume Profile computation, ported from the bot's
 * FixedVolumeProfileCalculationService (FixedVolumeProfileBot) so the chart's
 * live histogram matches the stored POC / VAH / VAL levels' algorithm.
 */

export interface VolumeProfileCandle {
  h: number;
  l: number;
  v?: number;
}

export interface FixedVolumeProfileResult {
  rowCount: number;
  rangeHigh: number;
  rangeLow: number;
  rowHeight: number;
  /** Volume per row, index 0 = lowest price row. */
  rowVolumes: number[];
  totalVolume: number;
  pocRow: number;
  pocPrice: number;
  valueAreaHigh: number;
  valueAreaLow: number;
}

/** Row count the chart renders with (the bot stores levels computed with 200 rows). */
export const FIXED_VOLUME_PROFILE_RENDER_ROWS = 100;
export const FIXED_VOLUME_PROFILE_VALUE_AREA_PERCENT = 70;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Distribute each candle's volume over the price rows it overlaps (proportional
 * to the overlap; a zero-range candle splits evenly), then expand the value area
 * from the POC towards the larger neighbour until `valueAreaPercent` is reached.
 * Returns null for no candles, no price range or no volume (same as the bot).
 */
export function computeFixedVolumeProfile(
  candles: readonly VolumeProfileCandle[],
  rowCount: number = FIXED_VOLUME_PROFILE_RENDER_ROWS,
  valueAreaPercent: number = FIXED_VOLUME_PROFILE_VALUE_AREA_PERCENT,
): FixedVolumeProfileResult | null {
  if (!candles?.length || rowCount <= 0) return null;

  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  for (const c of candles) {
    if (c.h > rangeHigh) rangeHigh = c.h;
    if (c.l < rangeLow) rangeLow = c.l;
  }
  if (!(rangeHigh > rangeLow)) return null;

  const rowHeight = (rangeHigh - rangeLow) / rowCount;
  const rowVolumes = new Array<number>(rowCount).fill(0);

  for (const c of candles) {
    const volume = Number.isFinite(c.v) ? (c.v as number) : 0;
    const firstRow = clamp(Math.floor((c.l - rangeLow) / rowHeight), 0, rowCount - 1);
    const lastRow = clamp(Math.floor((c.h - rangeLow) / rowHeight), 0, rowCount - 1);
    const entryRange = c.h - c.l;
    const flatShare = 1 / (lastRow - firstRow + 1);

    for (let row = firstRow; row <= lastRow; row++) {
      const rowBottom = rangeLow + row * rowHeight;
      const rowTop = rowBottom + rowHeight;
      const overlap = Math.max(0, Math.min(c.h, rowTop) - Math.max(c.l, rowBottom));
      const share = entryRange > 0 ? overlap / entryRange : flatShare;
      rowVolumes[row] += volume * share;
    }
  }

  const totalVolume = rowVolumes.reduce((sum, v) => sum + v, 0);
  if (totalVolume <= 0) return null;

  let pocRow = 0;
  for (let i = 1; i < rowCount; i++) {
    if (rowVolumes[i] > rowVolumes[pocRow]) pocRow = i;
  }

  let lowRow = pocRow;
  let highRow = pocRow;
  let accumulated = rowVolumes[pocRow];
  const targetVolume = (totalVolume * valueAreaPercent) / 100;

  while (accumulated < targetVolume && (lowRow > 0 || highRow < rowCount - 1)) {
    const above = highRow < rowCount - 1 ? rowVolumes[highRow + 1] : -1;
    const below = lowRow > 0 ? rowVolumes[lowRow - 1] : -1;
    if (above >= below) {
      highRow++;
      accumulated += above;
    } else {
      lowRow--;
      accumulated += below;
    }
  }

  return {
    rowCount,
    rangeHigh,
    rangeLow,
    rowHeight,
    rowVolumes,
    totalVolume,
    pocRow,
    pocPrice: rangeLow + pocRow * rowHeight + rowHeight / 2,
    valueAreaLow: rangeLow + lowRow * rowHeight,
    valueAreaHigh: rangeLow + highRow * rowHeight + rowHeight,
  };
}

/** Candles whose open time lies in [startMs, endMs] (bounds in either order). */
export function candlesInRange<T extends { x: number }>(candles: readonly T[], startMs: number, endMs: number): T[] {
  const from = Math.min(startMs, endMs);
  const to = Math.max(startMs, endMs);
  return candles.filter((c) => c.x >= from && c.x <= to);
}
