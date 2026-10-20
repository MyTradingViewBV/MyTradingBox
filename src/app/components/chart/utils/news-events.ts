/**
 * News (ForexFactory calendar) markers on the price pane, ported from the WPF chart
 * (ChartManagerLiveCharts2.SetNewsEventsSeries): every candle an event window overlaps
 * gets one 📰 marker at its high; events after the last / before the first candle land
 * on a virtual candle beyond the edge. Red when any event of the candle is high impact.
 */
import type { ForexCalendarEventDto } from 'src/app/modules/shared/models/chart/forex-calendar-event.dto';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Events are shown for at most this long before the last candle (WPF: 90 days). */
export const NEWS_LOOKBACK_DAYS = 90;
/** Upcoming events are shown up to this long after the last candle (WPF: 30 days). */
export const NEWS_LOOKAHEAD_DAYS = 30;

export interface NewsCandle {
  x: number;
  h: number;
}

export interface NewsMarker {
  /** Candle start time (ms, UTC); beyond the loaded range for virtual candles. */
  x: number;
  /** Price the marker sits on: the candle's high (nearest real candle for virtual ones). */
  price: number;
  highImpact: boolean;
  events: ForexCalendarEventDto[];
}

/** UTC midnight of an API date ("2026-10-31T00:00:00", no zone suffix = UTC). */
function utcDate(value: string): number | null {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!day) return null;
  return Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
}

/** "8:30am" / "12:00pm" / "14:30" → minutes after midnight; null when not a clock time. */
function clockMinutes(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*([ap]m)?$/i.exec(text);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * UTC [start, end) window of an event (WPF ParseNewsEventWindow): empty / "All Day" /
 * "Tentative" / unknown = the whole day, a day range like "23rd-30th" = 7 days, a clock
 * time = 1 minute. Null when the date is unusable.
 */
export function newsEventWindow(event: ForexCalendarEventDto): { start: number; end: number } | null {
  const date = utcDate(event.EventDate);
  if (date == null) return null;
  const text = (event.EventTime ?? '').trim();
  if (text.includes('-') && !text.includes(':')) return { start: date, end: date + 7 * DAY_MS };
  const minutes = text ? clockMinutes(text) : null;
  if (minutes == null) return { start: date, end: date + DAY_MS };
  const start = date + minutes * MINUTE_MS;
  return { start, end: start + MINUTE_MS };
}

export function isHighImpact(event: ForexCalendarEventDto): boolean {
  return (event.Impact ?? '').toLowerCase().includes('red');
}

/** UTC window of events shown for the loaded candles (WPF: last candle − 90 days … + 30 days). */
export function newsDisplayRange(candles: NewsCandle[]): { from: number; to: number } | null {
  if (!candles.length) return null;
  const lastDay = Math.floor(candles[candles.length - 1].x / DAY_MS) * DAY_MS;
  const firstDay = Math.floor(candles[0].x / DAY_MS) * DAY_MS;
  return {
    from: Math.max(firstDay, lastDay - NEWS_LOOKBACK_DAYS * DAY_MS),
    to: lastDay + (NEWS_LOOKAHEAD_DAYS + 1) * DAY_MS,
  };
}

/** First index whose x is >= time (candles sorted by x). */
function lowerBound(candles: NewsCandle[], time: number): number {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].x < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Group the events per candle they overlap; one marker per candle, sorted by time. */
export function buildNewsMarkers(candles: NewsCandle[], events: ForexCalendarEventDto[]): NewsMarker[] {
  if (!candles.length || !events.length) return [];
  let interval = candles.length > 1 ? candles[1].x - candles[0].x : 60 * MINUTE_MS;
  if (!(interval > 0)) interval = 60 * MINUTE_MS;
  const first = candles[0];
  const last = candles[candles.length - 1];

  const byX = new Map<number, NewsMarker>();
  const add = (x: number, price: number, event: ForexCalendarEventDto): void => {
    let marker = byX.get(x);
    if (!marker) {
      marker = { x, price, highImpact: false, events: [] };
      byX.set(x, marker);
    }
    marker.events.push(event);
    if (isHighImpact(event)) marker.highImpact = true;
  };

  const range = newsDisplayRange(candles)!;
  for (const event of events) {
    const window = newsEventWindow(event);
    if (!window || window.end <= range.from || window.start >= range.to) continue;
    const end = Math.max(window.end, window.start + 1000);
    if (window.start > last.x) {
      add(last.x + Math.ceil((window.start - last.x) / interval) * interval, last.h, event);
      continue;
    }
    if (end < first.x) {
      add(first.x - Math.ceil((first.x - end) / interval) * interval, first.h, event);
      continue;
    }
    // Candles [x, x + interval) overlapping [start, end).
    for (let i = Math.max(0, lowerBound(candles, window.start - interval + 1)); i < candles.length; i++) {
      const c = candles[i];
      if (c.x >= end) break;
      if (c.x + interval > window.start) add(c.x, c.h, event);
    }
  }
  return [...byX.values()].sort((a, b) => a.x - b.x);
}

/** Tooltip line of an event: "USD Non-Farm Payrolls (8:30am)" plus actual / forecast / previous when known. */
export function newsEventLine(event: ForexCalendarEventDto): string {
  const head = [event.Currency, event.EventName].filter(Boolean).join(' ');
  const time = event.EventTime ? ` (${event.EventTime})` : '';
  const values = [
    event.Actual ? `A ${event.Actual}` : '',
    event.Forecast ? `F ${event.Forecast}` : '',
    event.Previous ? `P ${event.Previous}` : '',
  ].filter(Boolean);
  return `${head}${time}${values.length ? '  ' + values.join(' · ') : ''}`;
}
