import { Candle } from 'src/app/modules/shared/models/chart/candle.dto';
import { BoxModel } from 'src/app/modules/shared/models/chart/boxModel.dto';
import { WatchlistDTO } from 'src/app/modules/shared/models/watchlist/watchlist.dto';
import { HeartbeatItem } from '../admin/services/heartbeat.service';

/** Timeframes offered by the chart's timeframe picker (chart-base.component.ts). */
export const DASHBOARD_TIMEFRAMES = [
  '1m',
  '3m',
  '6m',
  '12m',
  '24m',
  '1h',
  '4h',
  '1d',
  '1w',
  '1M',
] as const;

export const DASHBOARD_DEFAULT_SYMBOL = 'BTCUSDT';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RangeSummary {
  last: number;
  open: number;
  high: number;
  low: number;
  changePct: number;
  /** Where the last price sits between low (0) and high (100). */
  positionPct: number;
  closes: number[];
  lastTime: string;
}

/** Price range of a candle series: first open, last close, extremes and closes for a sparkline. */
export function summarizeRange(candles: Candle[]): RangeSummary | null {
  const valid = candles.filter(
    (c) => Number.isFinite(c.High) && Number.isFinite(c.Low) && Number.isFinite(c.Close),
  );
  if (!valid.length) return null;
  const open = valid[0].Open;
  const last = valid[valid.length - 1].Close;
  const high = Math.max(...valid.map((c) => c.High));
  const low = Math.min(...valid.map((c) => c.Low));
  const span = high - low;
  return {
    last,
    open,
    high,
    low,
    changePct: open ? ((last - open) / open) * 100 : 0,
    positionPct: span > 0 ? ((last - low) / span) * 100 : 50,
    closes: valid.map((c) => c.Close),
    lastTime: valid[valid.length - 1].Time,
  };
}

export interface BoxSummary {
  total: number;
  long: number;
  short: number;
  last24h: number;
  perTimeframe: { timeframe: string; count: number }[];
}

function direction(value: string | undefined): 'long' | 'short' | null {
  const v = (value ?? '').trim().toLowerCase();
  if (v.startsWith('long')) return 'long';
  if (v.startsWith('short')) return 'short';
  return null;
}

/** Box counts for one symbol, from the per-timeframe box lists. */
export function summarizeBoxes(
  boxesByTimeframe: Record<string, BoxModel[]>,
  now = Date.now(),
): BoxSummary {
  const summary: BoxSummary = { total: 0, long: 0, short: 0, last24h: 0, perTimeframe: [] };
  for (const timeframe of DASHBOARD_TIMEFRAMES) {
    const boxes = boxesByTimeframe[timeframe] ?? [];
    summary.perTimeframe.push({ timeframe, count: boxes.length });
    for (const box of boxes) {
      summary.total += 1;
      const dir = direction(box.PositionType);
      if (dir === 'long') summary.long += 1;
      if (dir === 'short') summary.short += 1;
      const created = box.CreatedAt ? Date.parse(box.CreatedAt) : NaN;
      if (Number.isFinite(created) && now - created <= DAY_MS) summary.last24h += 1;
    }
  }
  return summary;
}

export interface WatchlistSummary {
  total: number;
  symbols: number;
  long: number;
  short: number;
  byStatus: { status: string; count: number }[];
}

/** Watchlist rows across all symbols, grouped by status (largest first). */
export function summarizeWatchlist(rows: WatchlistDTO[]): WatchlistSummary {
  const statusCounts = new Map<string, number>();
  let long = 0;
  let short = 0;
  for (const row of rows) {
    const status = (row.Status || row.State || '').trim() || '—';
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    const dir = direction(row.Direction);
    if (dir === 'long') long += 1;
    if (dir === 'short') short += 1;
  }
  return {
    total: rows.length,
    symbols: new Set(rows.map((r) => r.Symbol)).size,
    long,
    short,
    byStatus: [...statusCounts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
  };
}

export interface HeartbeatSummary {
  running: number;
  total: number;
}

export function summarizeHeartbeats(items: HeartbeatItem[]): HeartbeatSummary {
  return { running: items.filter((i) => i.ok).length, total: items.length };
}

export interface CalendarEvent {
  EventDate: string;
  EventTime?: string | null;
  Currency?: string | null;
  Impact?: string | null;
  EventName: string;
  Actual?: string | null;
  Forecast?: string | null;
}

/** Today's events, high impact only when the feed marks impact; at most `max`. */
export function pickTodayEvents(
  events: CalendarEvent[],
  today: Date,
  max = 5,
): CalendarEvent[] {
  const day = localDateKey(today);
  const todays = events.filter((e) => (e.EventDate ?? '').slice(0, 10) === day);
  const high = todays.filter((e) => /high/i.test(e.Impact ?? ''));
  return (high.length ? high : todays).slice(0, max);
}

/** yyyy-MM-dd in local time. */
export function localDateKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** "5 minutes ago" style text in the browser's language. */
export function relativeTime(
  date: Date | null | undefined,
  now = Date.now(),
  locale?: string,
): string {
  if (!date || !Number.isFinite(date.getTime())) return '—';
  const seconds = Math.round((date.getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

/** Number with fixed decimals in the given locale, e.g. 8.20 (en) or 8,20 (nl). */
export function formatNumber(value: number, digits: number, locale?: string): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Fear & Greed classification bucket for colouring (0–100). */
export function moodLevel(value: number): 'fear' | 'neutral' | 'greed' {
  if (value < 45) return 'fear';
  if (value > 55) return 'greed';
  return 'neutral';
}
