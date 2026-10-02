/**
 * Axis tick generation for the Chart.js charts.
 *
 * Ticks are computed from the live scale range on every layout pass (scale
 * `afterBuildTicks`), so they are always in sync with the current pan/zoom:
 * - time ticks sit on round local-time boundaries (every 15 min, 4 h, day,
 *   month, ...) instead of on whichever candle happens to be first on screen,
 *   so labels stay put while panning and are evenly spaced;
 * - value ticks sit on nice multiples (1/2/2.5/5 x 10^n) strictly inside the
 *   visible range, so there are no odd edge labels like 61234.57.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

type TimeUnit = 'minute' | 'hour' | 'day' | 'month' | 'year';

export interface TimeStep {
  unit: TimeUnit;
  count: number;
  /** Approximate length, used to choose a step. */
  approxMs: number;
}

const step = (unit: TimeUnit, count: number, unitMs: number): TimeStep => ({
  unit,
  count,
  approxMs: count * unitMs,
});

const TIME_STEPS: TimeStep[] = [
  ...[1, 2, 5, 10, 15, 30].map((n) => step('minute', n, MINUTE_MS)),
  ...[1, 2, 3, 4, 6, 12].map((n) => step('hour', n, HOUR_MS)),
  ...[1, 2, 3, 5, 10, 15].map((n) => step('day', n, DAY_MS)),
  ...[1, 2, 3, 6].map((n) => step('month', n, 30.44 * DAY_MS)),
  ...[1, 2, 5, 10, 25, 50].map((n) => step('year', n, 365.25 * DAY_MS)),
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Smallest step that keeps labels at least `minLabelPx` apart and is not
 * finer than one candle (`minStepMs`), so a daily chart never shows 12:00.
 */
export function pickTimeStep(
  rangeMs: number,
  widthPx: number,
  minLabelPx: number,
  minStepMs = 0,
): TimeStep {
  const maxLabels = Math.max(2, Math.floor(widthPx / Math.max(1, minLabelPx)));
  const target = rangeMs / maxLabels;
  // 0.9: a calendar month (28-31 days) still counts as "one 1M candle".
  return (
    TIME_STEPS.find((s) => s.approxMs >= target && s.approxMs >= minStepMs * 0.9) ??
    TIME_STEPS[TIME_STEPS.length - 1]
  );
}

function alignDown(ms: number, s: TimeStep): Date {
  const d = new Date(ms);
  d.setSeconds(0, 0);
  switch (s.unit) {
    case 'minute':
      d.setMinutes(Math.floor(d.getMinutes() / s.count) * s.count);
      break;
    case 'hour':
      d.setMinutes(0);
      d.setHours(Math.floor(d.getHours() / s.count) * s.count);
      break;
    case 'day':
      d.setHours(0, 0);
      d.setDate(1 + Math.floor((d.getDate() - 1) / s.count) * s.count);
      break;
    case 'month':
      d.setHours(0, 0);
      d.setDate(1);
      d.setMonth(Math.floor(d.getMonth() / s.count) * s.count);
      break;
    case 'year':
      d.setHours(0, 0);
      d.setMonth(0, 1);
      d.setFullYear(Math.floor(d.getFullYear() / s.count) * s.count);
      break;
  }
  return d;
}

function advance(d: Date, s: TimeStep): Date {
  const next = new Date(d.getTime());
  switch (s.unit) {
    case 'minute':
      next.setMinutes(next.getMinutes() + s.count);
      break;
    case 'hour':
      next.setHours(next.getHours() + s.count);
      // Re-align after a DST jump so labels stay on multiples of the step.
      if (next.getHours() % s.count !== 0) return alignDown(next.getTime() + s.count * HOUR_MS, s);
      break;
    case 'day': {
      if (s.count === 1) {
        next.setDate(next.getDate() + 1);
        break;
      }
      const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      const candidate = next.getDate() + s.count;
      // Skip a stub at the end of the month (e.g. the 31st right before the 1st).
      if (daysInMonth - candidate + 1 < s.count * 0.6) {
        next.setMonth(next.getMonth() + 1, 1);
      } else {
        next.setDate(candidate);
      }
      break;
    }
    case 'month':
      next.setMonth(next.getMonth() + s.count, 1);
      break;
    case 'year':
      next.setFullYear(next.getFullYear() + s.count);
      break;
  }
  return next;
}

/** Tick timestamps on round local-time boundaries within [min, max]. */
export function generateTimeTicks(min: number, max: number, s: TimeStep): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const ticks: number[] = [];
  let d = alignDown(min, s);
  for (let i = 0; i < 500 && d.getTime() <= max; i++) {
    if (d.getTime() >= min) ticks.push(d.getTime());
    d = advance(d, s);
  }
  return ticks;
}

/**
 * Label for a time tick, by the coarsest boundary it falls on:
 * year start "2026", month start "Oct", day start "2 Oct", otherwise "14:30".
 * `dateOnly` ignores the clock time (candles >= 1 day).
 */
export function formatTimeAxisLabel(ms: number, dateOnly = false): string {
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  const midnight = dateOnly || (d.getHours() === 0 && d.getMinutes() === 0);
  if (midnight && d.getDate() === 1) {
    return d.getMonth() === 0 ? String(d.getFullYear()) : MONTHS[d.getMonth()];
  }
  if (midnight) return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Nice step (1, 2, 2.5, 5 x 10^n) of at least `rough`. */
export function niceStepAtLeast(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const scaled = rough / power;
  const nice = [1, 2, 2.5, 5, 10].find((n) => n >= scaled - 1e-9) ?? 10;
  return nice * power;
}

/** Value ticks at nice multiples strictly inside [min, max], about `minLabelPx` apart. */
export function generateValueTicks(
  min: number,
  max: number,
  heightPx: number,
  minLabelPx: number,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || heightPx <= 0) return [];
  const maxLabels = Math.max(2, Math.floor(heightPx / Math.max(1, minLabelPx)));
  const s = niceStepAtLeast((max - min) / maxLabels);
  const first = Math.ceil(min / s - 1e-9);
  const last = Math.floor(max / s + 1e-9);
  const ticks: number[] = [];
  for (let k = first; k <= last && ticks.length < 200; k++) {
    // Multiply instead of accumulate so float error does not drift.
    ticks.push(Number((k * s).toPrecision(12)));
  }
  return ticks;
}

/** Decimals needed to tell ticks `stepValue` apart (at least `minDecimals`). */
export function decimalsForStep(stepValue: number, minDecimals = 2, maxDecimals = 8): number {
  if (!Number.isFinite(stepValue) || stepValue <= 0) return minDecimals;
  let decimals = 0;
  for (; decimals < maxDecimals; decimals++) {
    const scaled = stepValue * 10 ** decimals;
    // Relative tolerance: absorbs float noise without hiding tiny steps.
    if (Math.abs(Math.round(scaled) - scaled) <= scaled * 1e-6) break;
  }
  return Math.min(maxDecimals, Math.max(minDecimals, decimals));
}

interface TickScaleLike {
  min: number;
  max: number;
  width: number;
  height: number;
  ticks: Array<{ value: number; label?: string | string[] }>;
}

/** `afterBuildTicks` for a time x-axis. `candleMs` = one candle's duration. */
export function applyTimeTicks(scale: TickScaleLike, candleMs = 0): void {
  const width = scale.width;
  if (!(width > 0)) return;
  const minLabelPx = width < 500 ? 70 : 90;
  const s = pickTimeStep(scale.max - scale.min, width, minLabelPx, candleMs);
  scale.ticks = generateTimeTicks(scale.min, scale.max, s).map((value) => ({ value }));
}

/** `afterBuildTicks` for a linear value y-axis. */
export function applyValueTicks(scale: TickScaleLike, minLabelPx = 44): void {
  const ticks = generateValueTicks(scale.min, scale.max, scale.height, minLabelPx);
  if (ticks.length) scale.ticks = ticks.map((value) => ({ value }));
}
