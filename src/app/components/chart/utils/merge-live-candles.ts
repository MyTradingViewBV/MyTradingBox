/**
 * Pure utility functions for merging live candlestick data
 * into existing candle arrays without breaking existing logic
 */

import {
  getTimeframeBucketStart,
  isCalendarTimeframe,
  normalizeTimeframe,
  timeframeToMilliseconds,
} from './timeframe-bucketing';

const DAY_MS = 24 * 60 * 60_000;
const WEEK_MS = 7 * DAY_MS;
/** Legacy fixed period that `timeframeToMilliseconds('1M')` returns without a reference time. */
const MONTH_PERIOD_MS = 30 * DAY_MS;

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

/**
 * Resolve the calendar timeframe (1w / 1M / ...) a merge should bucket by.
 * An explicit `timeframe` wins; otherwise the legacy fixed periods produced
 * by `timeframeToMilliseconds('1w' | '1M')` are recognised, because fixed-length
 * flooring is wrong for them (months differ in length, and epoch-aligned
 * 7-day buckets start on Thursday instead of Monday).
 */
function resolveCalendarTimeframe(
  periodMs: number,
  timeframe?: string,
): string | null {
  if (timeframe) {
    const normalized = normalizeTimeframe(timeframe);
    return isCalendarTimeframe(normalized) ? normalized : null;
  }
  if (periodMs === MONTH_PERIOD_MS) return '1M';
  if (periodMs === WEEK_MS) return '1w';
  return null;
}

function candleBucket(
  time: number,
  periodMs: number,
  calendarTimeframe: string | null,
): number {
  if (calendarTimeframe)
    return getTimeframeBucketStart(time, calendarTimeframe);
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
 * @param options.periodMs - Fixed period used to match the live bar to the last bar's bucket
 * @param options.timeframe - App timeframe ('1w', '1M', ...). When given, calendar
 *   timeframes bucket by calendar boundaries (week starts Monday UTC, month = calendar
 *   month). Without it, a periodMs of exactly 7d / 30d is treated as 1w / 1M.
 * @returns A NEW candle array when something changed, or the SAME reference when the
 *   update was ignored. Callers rely on `merged === candles` meaning "no change",
 *   so the input is never mutated. The copy is a shallow O(n) pointer copy (no candle
 *   objects are cloned except the updated one), which is cheap next to a chart redraw.
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
  options?: { periodMs?: number; timeframe?: string },
): CandleForMerge[] {
  const periodMs =
    options?.periodMs ??
    (options?.timeframe ? timeframeToMilliseconds(options.timeframe) : 0);
  const calendarTimeframe = resolveCalendarTimeframe(
    periodMs,
    options?.timeframe,
  );
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
  if (foundIndex < 0 && (periodMs > 0 || calendarTimeframe)) {
    const liveBucket = candleBucket(
      liveUpdate.openTime,
      periodMs,
      calendarTimeframe,
    );
    const lastBucket = candleBucket(lastTime, periodMs, calendarTimeframe);
    if (liveBucket === lastBucket) {
      foundIndex = lastIdx;
    }
  }

  if (foundIndex >= 0) {
    const updated = candles.slice();
    const existing = candles[foundIndex];
    const existingNorm = normalizeCandle(existing);
    updated[foundIndex] = {
      ...existing,
      x: existing.x ?? liveUpdate.openTime,
      o: Number.isFinite(existingNorm.open)
        ? existingNorm.open
        : liveUpdate.open,
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
