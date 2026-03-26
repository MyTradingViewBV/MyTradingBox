/**
 * Pure utility functions for merging live candlestick data
 * into existing candle arrays without breaking existing logic
 */

export interface CandleForMerge {
  x?: number; // Chart.js x timestamp (milliseconds)
  o?: number; // open
  h?: number; // high
  l?: number; // low
  c?: number; // close
  v?: number; // volume
  timeStr?: string; // original ISO time string (used for x-axis tick formatting)
  Time?: string; // ISO string backup
  Open?: number; // backup fields
  High?: number;
  Low?: number;
  Close?: number;
  Volume?: number;
}

/**
 * Normalize a candle to ensure consistent field access
 * Handles both Chart.js format (x, o, h, l, c) and DTO format (Time, Open, High, Low, Close)
 */
export function normalizeCandle(candle: CandleForMerge): {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
} {
  const parseUtcMs = (s: string) =>
    new Date(/[Zz]$|[+\-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z').getTime();
  const time = candle.x ?? (candle.Time ? parseUtcMs(candle.Time) : 0);
  return {
    time,
    open: candle.o ?? candle.Open ?? 0,
    high: candle.h ?? candle.High ?? 0,
    low: candle.l ?? candle.Low ?? 0,
    close: candle.c ?? candle.Close ?? 0,
    volume: candle.v ?? candle.Volume ?? 0,
  };
}

/**
 * Safely merge a live kline update into the existing candle array
 *
 * Rules:
 * - If the array is empty, create a new candle from the live data
 * - If the live candle's openTime matches the last candle's time, UPDATE the last candle
 * - If the live candle's openTime is AFTER the last candle's time, APPEND a new candle
 * - If the live candle's time is older/duplicated (shouldn't happen), ignore it
 * - Never duplicate the same time
 * - Maintain ascending time order
 *
 * @param candles - Existing candle array (in Chart.js format: x, o, h, l, c, v)
 * @param liveUpdate - Live kline data with openTime and OHLCV
 * @returns New candle array with live update merged in (does not mutate input)
 */
export function mergeLiveCandle(
  candles: CandleForMerge[],
  liveUpdate: {
    openTime: number;
    closeTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    isClosed?: boolean;
  },
): CandleForMerge[] {
  if (!candles || candles.length === 0) {
    // Empty array: create a new candle from live data
    return [
      {
        x: liveUpdate.openTime,
        o: liveUpdate.open,
        h: liveUpdate.high,
        l: liveUpdate.low,
        c: liveUpdate.close,
        v: liveUpdate.volume,
      },
    ];
  }

  // Find candle by openTime (the kline period's start time)
  // The last candle in the array might have a different x value (last update time)
  // but we need to match by the kline's opening time
  let foundIndex = -1;
  for (let i = candles.length - 1; i >= Math.max(0, candles.length - 5); i--) {
    const norm = normalizeCandle(candles[i]);
    if (norm.time === liveUpdate.openTime) {
      foundIndex = i;
      break;
    }
  }

  // If we found the matching candle by openTime, update it
  if (foundIndex >= 0) {
    const updated = [...candles];
    updated[foundIndex] = {
      x: liveUpdate.openTime,
      o: liveUpdate.open,
      h: liveUpdate.high,
      l: liveUpdate.low,
      c: liveUpdate.close,
      v: liveUpdate.volume,
    };
    return updated;
  }

  // Fallback: if no match found, append as new candle
  return [
    ...candles,
    {
      x: liveUpdate.openTime,
      o: liveUpdate.open,
      h: liveUpdate.high,
      l: liveUpdate.low,
      c: liveUpdate.close,
      v: liveUpdate.volume,
    },
  ];
}

/**
 * Validate that an interval (timeframe) string matches Binance format
 * @param interval - Timeframe string (e.g., "1m", "1h", "1d")
 * @returns true if valid Binance interval format
 */
export function isValidBinanceInterval(interval: string): boolean {
  const validIntervals = [
    '1m', '3m', '5m', '15m', '30m',
    '1h', '2h', '4h', '6h', '8h', '12h',
    '1d', '3d',
    '1w',
    '1M',
  ];
  return validIntervals.includes(interval);
}

/**
 * Timeframes that required client-side aggregation (no longer used —
 * the API serves 12m / 24m candles directly).
 */
export const AGGREGATE_TIMEFRAME_CONFIG: Record<
  string,
  { base: string; targetMs: number; limit: number }
> = {};

/**
 * Aggregate an array of candles (already in Chart.js format) into larger candles
 * using TIME-BOUNDARY grouping instead of positional grouping.
 *
 * This ensures candles align to clean time boundaries (e.g. every 24 minutes
 * from midnight: 00:00, 00:24, 00:48, 01:12, …) regardless of gaps or
 * irregular intervals in the source data.
 *
 * Falls back to positional grouping if timestamps are missing.
 */
export function aggregateCandles(
  candles: CandleForMerge[],
  groupSizeOrTargetMs: number,
): CandleForMerge[] {
  if (!candles.length) return [];

  // If targetMs looks like a positional count (< 100), convert to ms assuming
  // candle interval from data. But prefer the time-based path.
  let targetMs = groupSizeOrTargetMs;
  if (targetMs < 100) {
    // Legacy positional groupSize – estimate interval from first two candles
    const t0 = candles[0]?.x ?? 0;
    const t1 = candles[1]?.x ?? 0;
    const interval = t1 - t0;
    if (interval > 0) {
      targetMs = groupSizeOrTargetMs * interval;
    } else {
      // Can't determine interval: fall back to pure positional
      return aggregateCandlesPositional(candles, groupSizeOrTargetMs);
    }
  }

  const result: CandleForMerge[] = [];
  let bucketStart = Math.floor((candles[0].x ?? 0) / targetMs) * targetMs;
  let group: CandleForMerge[] = [];

  for (const c of candles) {
    const t = c.x ?? 0;
    // Determine which bucket this candle belongs to
    const thisBucket = Math.floor(t / targetMs) * targetMs;
    if (thisBucket !== bucketStart && group.length > 0) {
      // Flush previous group
      result.push(mergeGroup(group, bucketStart));
      group = [];
      bucketStart = thisBucket;
    }
    if (group.length === 0) bucketStart = thisBucket;
    group.push(c);
  }
  // Flush last group
  if (group.length > 0) {
    result.push(mergeGroup(group, bucketStart));
  }
  return result;
}

/** Merge a group of candles into a single OHLCV candle */
function mergeGroup(group: CandleForMerge[], bucketTime: number): CandleForMerge {
  const first = group[0];
  const last = group[group.length - 1];
  return {
    x: bucketTime,
    timeStr: first.timeStr,
    o: first.o ?? first.Open,
    h: Math.max(...group.map((c) => c.h ?? c.High ?? 0)),
    l: Math.min(...group.map((c) => c.l ?? c.Low ?? Infinity)),
    c: last.c ?? last.Close,
    v: group.reduce((sum, c) => sum + (c.v ?? c.Volume ?? 0), 0),
  };
}

/** Pure positional grouping fallback (original algorithm) */
function aggregateCandlesPositional(
  candles: CandleForMerge[],
  groupSize: number,
): CandleForMerge[] {
  const result: CandleForMerge[] = [];
  for (let i = 0; i + groupSize <= candles.length; i += groupSize) {
    const group = candles.slice(i, i + groupSize);
    result.push(mergeGroup(group, group[0].x ?? 0));
  }
  return result;
}

/**
 * Mapping of app-specific timeframes that don't exist on Binance to the
 * nearest supported Binance interval used for the live stream.
 */
export const APPROXIMATE_INTERVAL_MAP: Record<string, string> = {
  '12m': '15m',
  '24m': '30m',
};

/**
 * Returns true when the app timeframe needs a different (approximate)
 * Binance interval for the live stream (e.g. 12m uses 15m stream).
 */
export function isApproximateInterval(appTimeframe: string): boolean {
  return (appTimeframe || '').toLowerCase().trim() in APPROXIMATE_INTERVAL_MAP;
}

/**
 * Convert app timeframe string to Binance interval format
 * (In most cases they are identical, but this ensures consistency)
 * @param appTimeframe - Timeframe string from app settings
 * @returns Valid Binance interval string, or null if unsupported
 */
export function mapTimeframeToBinanceInterval(
  appTimeframe: string,
): string | null {
  const normalized = (appTimeframe || '').toLowerCase().trim();
  if (isValidBinanceInterval(normalized)) {
    return normalized;
  }
  // Fall back to nearest Binance interval for non-standard timeframes (e.g. 12m→15m, 24m→30m)
  if (APPROXIMATE_INTERVAL_MAP[normalized]) {
    return APPROXIMATE_INTERVAL_MAP[normalized];
  }
  return null;
}
