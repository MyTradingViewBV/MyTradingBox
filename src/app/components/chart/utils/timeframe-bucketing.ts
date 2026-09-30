const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function isOneMinuteTimeframe(timeframe: string): boolean {
  const normalized = normalizeTimeframe(timeframe);
  return normalized === '1' || normalized === '1m';
}

export function normalizeTimeframe(timeframe: string): string {
  const trimmed = (timeframe || '').trim();
  return trimmed === '1M' ? trimmed : trimmed.toLowerCase();
}

export function isCalendarTimeframe(timeframe: string): boolean {
  return ['1d', '1w', '1M', '1j'].includes(normalizeTimeframe(timeframe));
}

export function parseTimeframeMinutes(timeframe: string): number {
  const normalized = normalizeTimeframe(timeframe);
  if (normalized.endsWith('m')) {
    const minutes = Number.parseInt(normalized.slice(0, -1), 10);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 1;
  }
  if (normalized.endsWith('h')) {
    const hours = Number.parseInt(normalized.slice(0, -1), 10);
    return Number.isFinite(hours) && hours > 0 ? hours * 60 : 1;
  }
  const minutes = Number.parseInt(normalized, 10);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 1;
}

export function getTimeframeBucketStart(timeMs: number, timeframe: string): number {
  const normalized = normalizeTimeframe(timeframe);
  const date = new Date(timeMs);

  switch (normalized) {
    case '1d':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    case '1w': {
      const day = date.getUTCDay();
      const diff = (day - 1 + 7) % 7;
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - diff);
    }
    case '1M':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    case '1j':
      return Date.UTC(date.getUTCFullYear(), 0, 1);
    default: {
      const timeframeMs = parseTimeframeMinutes(normalized) * MINUTE_MS;
      return Math.floor(timeMs / timeframeMs) * timeframeMs;
    }
  }
}

export function getTimeframeBucketEnd(bucketStartMs: number, timeframe: string): number {
  const normalized = normalizeTimeframe(timeframe);
  const date = new Date(bucketStartMs);

  switch (normalized) {
    case '1d':
      return bucketStartMs + DAY_MS;
    case '1w':
      return bucketStartMs + 7 * DAY_MS;
    case '1M':
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    case '1j':
      return Date.UTC(date.getUTCFullYear() + 1, 0, 1);
    default:
      return bucketStartMs + parseTimeframeMinutes(normalized) * MINUTE_MS;
  }
}

const UNIT_MS: Record<string, number> = {
  '': MINUTE_MS,
  m: MINUTE_MS,
  h: 60 * MINUTE_MS,
  d: DAY_MS,
  w: 7 * DAY_MS,
};

/**
 * Length of one candle of `timeframe` in milliseconds, or 0 when the
 * timeframe is not recognised. The single timeframe→ms helper for the app.
 *
 * '1M' is a calendar month and '1j' a calendar year: with `atMs` the real
 * length of the month/year containing `atMs` is returned; without it the
 * nominal 30 / 365 days. '1M' is never confused with '1m' (one minute).
 */
export function timeframeToMilliseconds(timeframe: string, atMs?: number): number {
  const normalized = normalizeTimeframe(timeframe);
  if (normalized === '1M' || normalized === '1j') {
    if (atMs !== undefined && Number.isFinite(atMs)) {
      const start = getTimeframeBucketStart(atMs, normalized);
      return getTimeframeBucketEnd(start, normalized) - start;
    }
    return normalized === '1M' ? 30 * DAY_MS : 365 * DAY_MS;
  }
  const match = /^(\d+)([mhdw]?)$/.exec(normalized);
  if (!match) return 0;
  const count = Number.parseInt(match[1], 10);
  return count > 0 ? count * UNIT_MS[match[2]] : 0;
}
