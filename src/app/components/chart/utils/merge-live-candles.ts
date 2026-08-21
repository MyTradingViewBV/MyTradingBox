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
export function parseUtcMs(s: string): number {
  return new Date(/[Zz]$|[+\-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z').getTime();
}

export function timeframeToPeriodMs(timeframe: string): number {
  const normalized = (timeframe || '').trim();
  const lower = normalized.toLowerCase();
  const map: Record<string, number> = {
    '1m': 60_000,
    '3m': 3 * 60_000,
    '5m': 5 * 60_000,
    '12m': 12 * 60_000,
    '15m': 15 * 60_000,
    '24m': 24 * 60_000,
    '30m': 30 * 60_000,
    '1h': 60 * 60_000,
    '2h': 2 * 60 * 60_000,
    '4h': 4 * 60 * 60_000,
    '6h': 6 * 60 * 60_000,
    '8h': 8 * 60 * 60_000,
    '12h': 12 * 60 * 60_000,
    '1d': 24 * 60 * 60_000,
    '3d': 3 * 24 * 60 * 60_000,
    '1w': 7 * 24 * 60 * 60_000,
  };
  if (map[lower]) return map[lower];
  if (normalized === '1M') return 30 * 24 * 60 * 60_000;
  return 0;
}

function candleBucket(time: number, periodMs: number): number {
  return periodMs > 0 ? Math.floor(time / periodMs) : time;
}

export function normalizeCandle(candle: CandleForMerge): {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
} {
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
  options?: { periodMs?: number },
): CandleForMerge[] {
  const periodMs = options?.periodMs ?? 0;
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

  const lastIdx = candles.length - 1;
  const lastNorm = normalizeCandle(candles[lastIdx]);
  const lastTime = lastNorm.time;

  // Match by exact openTime first (scan recent tail — REST and stream can disagree slightly)
  let foundIndex = -1;
  for (let i = lastIdx; i >= Math.max(0, lastIdx - 9); i--) {
    if (normalizeCandle(candles[i]).time === liveUpdate.openTime) {
      foundIndex = i;
      break;
    }
  }

  // Same timeframe bucket as the last bar → update in place (avoids duplicate live bars)
  if (foundIndex < 0 && periodMs > 0) {
    const liveBucket = candleBucket(liveUpdate.openTime, periodMs);
    const lastBucket = candleBucket(lastTime, periodMs);
    if (liveBucket === lastBucket) {
      foundIndex = lastIdx;
    }
  }

  if (foundIndex >= 0) {
    const updated = [...candles];
    const existing = candles[foundIndex];
    const existingNorm = normalizeCandle(existing);
    updated[foundIndex] = {
      ...existing,
      x: existing.x ?? liveUpdate.openTime,
      o: Number.isFinite(existingNorm.open) ? existingNorm.open : liveUpdate.open,
      h: Math.max(existingNorm.high, liveUpdate.high),
      l: Math.min(existingNorm.low, liveUpdate.low),
      c: liveUpdate.close,
      v: liveUpdate.volume >= 0 ? liveUpdate.volume : existingNorm.volume,
    };
    return updated;
  }

  // Ignore stale ticks that belong to an older period
  if (liveUpdate.openTime < lastTime) {
    return candles;
  }

  // New period — append
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
 * Parse a /Candles/live API payload into a mergeLiveCandle update object.
 */
/**
 * Parse a /Candles/live API payload into a mergeLiveCandle update object.
 */
function pickLiveCandleRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload) return null;
  if (!Array.isArray(payload)) {
    return typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  }
  for (let i = payload.length - 1; i >= 0; i--) {
    const row = payload[i];
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    const hasTime = record['Time'] != null || record['time'] != null || record['openTime'] != null;
    const hasClose = record['Close'] != null || record['close'] != null || record['c'] != null;
    if (hasTime && hasClose) return record;
  }
  const last = payload[payload.length - 1];
  return last && typeof last === 'object' ? (last as Record<string, unknown>) : null;
}

export function liveCandleApiToUpdate(
  payload: unknown,
  options?: { fallbackOpenTime?: number; periodMs?: number },
): {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed?: boolean;
} | null {
  const record = pickLiveCandleRecord(payload);
  if (!record) return null;
  const readNumber = (keys: string[], fallback = NaN): number => {
    for (const key of keys) {
      const value = Number(record[key]);
      if (Number.isFinite(value)) return value;
    }
    return fallback;
  };

  const closeExplicit = readNumber(['close', 'Close', 'c']);
  const tickerPrice = readNumber(['price', 'Price']);
  const close = Number.isFinite(closeExplicit)
    ? closeExplicit
    : tickerPrice;
  if (!Number.isFinite(close)) return null;

  const timeRaw =
    record['Time'] ??
    record['time'] ??
    record['openTime'] ??
    record['OpenTime'] ??
    record['timestamp'] ??
    record['Timestamp'];
  let openTime = NaN;
  if (typeof timeRaw === 'number' && Number.isFinite(timeRaw)) {
    openTime = timeRaw;
  } else if (typeof timeRaw === 'string' && timeRaw.trim()) {
    openTime = parseUtcMs(timeRaw);
  }
  if (!Number.isFinite(openTime)) {
    openTime = options?.fallbackOpenTime ?? NaN;
  }
  if (!Number.isFinite(openTime)) return null;

  const open = readNumber(['open', 'Open', 'o'], close);
  const high = readNumber(['high', 'High', 'h'], close);
  const low = readNumber(['low', 'Low', 'l'], close);
  const volume = readNumber(['volume', 'Volume', 'v'], 0);
  const periodMs = options?.periodMs ?? 0;
  const isClosed = Boolean(
    record['isClosed'] ?? record['IsClosed'] ?? record['closed'] ?? record['Closed'],
  );

  return {
    openTime,
    closeTime: openTime + (periodMs > 0 ? periodMs : 60_000),
    open,
    high,
    low,
    close,
    volume,
    isClosed,
  };
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
  const raw = (appTimeframe || '').trim();
  if (raw === '1M') return '1M';
  const normalized = raw.toLowerCase();
  if (isValidBinanceInterval(normalized)) {
    return normalized;
  }
  if (isValidBinanceInterval(raw)) {
    return raw;
  }
  // Fall back to nearest Binance interval for non-standard timeframes (e.g. 12m→15m, 24m→30m)
  if (APPROXIMATE_INTERVAL_MAP[normalized]) {
    return APPROXIMATE_INTERVAL_MAP[normalized];
  }
  return null;
}
