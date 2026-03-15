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
  const time = candle.x ?? (candle.Time ? new Date(candle.Time).getTime() : 0);
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
 * Timeframes that require client-side aggregation from a smaller base interval.
 * Key = app timeframe, value = { base interval to fetch, group size to merge }.
 */
export const AGGREGATE_TIMEFRAME_CONFIG: Record<
  string,
  { base: string; groupSize: number }
> = {
  '12m': { base: '3m', groupSize: 4 },
  '24m': { base: '3m', groupSize: 8 },
};

/**
 * Aggregate an array of candles (already in Chart.js format) into larger candles.
 * E.g. groupSize=4 turns four 3m candles into one 12m candle.
 * Only complete groups are emitted; a trailing partial group is discarded.
 */
export function aggregateCandles(
  candles: CandleForMerge[],
  groupSize: number,
): CandleForMerge[] {
  const result: CandleForMerge[] = [];
  for (let i = 0; i + groupSize <= candles.length; i += groupSize) {
    const group = candles.slice(i, i + groupSize);
    const first = group[0];
    const last = group[group.length - 1];
    result.push({
      x: first.x,
      o: first.o ?? first.Open,
      h: Math.max(...group.map((c) => c.h ?? c.High ?? 0)),
      l: Math.min(...group.map((c) => c.l ?? c.Low ?? Infinity)),
      c: last.c ?? last.Close,
      v: group.reduce((sum, c) => sum + (c.v ?? c.Volume ?? 0), 0),
    });
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
