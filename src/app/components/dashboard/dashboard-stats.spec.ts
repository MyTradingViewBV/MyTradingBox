import { describe, expect, it } from 'vitest';
import { Candle } from 'src/app/modules/shared/models/chart/candle.dto';
import { BoxModel } from 'src/app/modules/shared/models/chart/boxModel.dto';
import { WatchlistDTO } from 'src/app/modules/shared/models/watchlist/watchlist.dto';
import { HeartbeatItem } from '../admin/services/heartbeat.service';
import {
  CalendarEvent,
  DASHBOARD_TIMEFRAMES,
  formatNumber,
  localDateKey,
  moodLevel,
  pickTodayEvents,
  relativeTime,
  summarizeBoxes,
  summarizeHeartbeats,
  summarizeRange,
  summarizeWatchlist,
} from './dashboard-stats';
import { formatPrice } from './charts/mini-candles.component';

const candle = (o: number, h: number, l: number, c: number, t = '2026-10-20T10:00:00Z'): Candle => ({
  Symbol: 'BTCUSDT',
  Timeframe: '12m',
  Time: t,
  Open: o,
  High: h,
  Low: l,
  Close: c,
  Volume: 1,
});

describe('summarizeRange', () => {
  it('returns null without candles', () => {
    expect(summarizeRange([])).toBeNull();
  });

  it('uses the first open, last close and the extremes of the whole series', () => {
    const r = summarizeRange([
      candle(100, 110, 95, 105),
      candle(105, 120, 100, 115, '2026-10-20T10:12:00Z'),
      candle(115, 118, 90, 110, '2026-10-20T10:24:00Z'),
    ])!;
    expect(r.open).toBe(100);
    expect(r.last).toBe(110);
    expect(r.high).toBe(120);
    expect(r.low).toBe(90);
    expect(r.changePct).toBeCloseTo(10);
    expect(r.positionPct).toBeCloseTo((20 / 30) * 100);
    expect(r.closes).toEqual([105, 115, 110]);
    expect(r.lastTime).toBe('2026-10-20T10:24:00Z');
  });

  it('puts a flat series in the middle of the range', () => {
    expect(summarizeRange([candle(5, 5, 5, 5)])!.positionPct).toBe(50);
  });

  it('skips candles with missing prices', () => {
    const broken = { ...candle(1, 2, 0, 1), High: NaN };
    expect(summarizeRange([broken, candle(10, 12, 8, 11)])!.high).toBe(12);
  });
});

describe('summarizeBoxes', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const box = (tf: string, pos: string, created: string): BoxModel => ({
    Id: 1,
    Symbol: 'BTCUSDT',
    Timeframe: tf,
    ZoneMin: 1,
    ZoneMax: 2,
    Reason: 0,
    Strength: 0,
    PositionType: pos,
    CreatedAt: created,
  });

  it('counts totals, directions, new boxes and lists every timeframe in chart order', () => {
    const s = summarizeBoxes(
      {
        '1h': [box('1h', 'Long', '2026-10-20T08:00:00Z'), box('1h', 'Short', '2026-10-18T08:00:00Z')],
        '4h': [box('4h', 'Unset', '2026-10-19T13:00:00Z')],
      },
      now,
    );
    expect(s.total).toBe(3);
    expect(s.long).toBe(1);
    expect(s.short).toBe(1);
    expect(s.last24h).toBe(2);
    expect(s.perTimeframe.map((p) => p.timeframe)).toEqual([...DASHBOARD_TIMEFRAMES]);
    expect(s.perTimeframe.find((p) => p.timeframe === '1h')!.count).toBe(2);
    expect(s.perTimeframe.find((p) => p.timeframe === '1m')!.count).toBe(0);
  });

  it('ignores boxes without a creation date for the 24h count', () => {
    const s = summarizeBoxes({ '1d': [box('1d', 'long', '')] }, now);
    expect(s.last24h).toBe(0);
    expect(s.long).toBe(1);
  });
});

describe('summarizeWatchlist', () => {
  const row = (symbol: string, status: string, direction: string): WatchlistDTO =>
    Object.assign(new WatchlistDTO(), { Symbol: symbol, Status: status, Direction: direction });

  it('counts setups, unique symbols, directions and statuses (largest first)', () => {
    const s = summarizeWatchlist([
      row('BTCUSDT', 'Ready', 'Long'),
      row('BTCUSDT', 'Watching', 'Short'),
      row('ETHUSDT', 'Ready', 'Long'),
    ]);
    expect(s.total).toBe(3);
    expect(s.symbols).toBe(2);
    expect(s.long).toBe(2);
    expect(s.short).toBe(1);
    expect(s.byStatus).toEqual([
      { status: 'Ready', count: 2 },
      { status: 'Watching', count: 1 },
    ]);
  });

  it('handles an empty watchlist', () => {
    expect(summarizeWatchlist([])).toEqual({ total: 0, symbols: 0, long: 0, short: 0, byStatus: [] });
  });
});

describe('summarizeHeartbeats', () => {
  it('counts running bots', () => {
    const items = [{ ok: true }, { ok: false }, { ok: true }] as HeartbeatItem[];
    expect(summarizeHeartbeats(items)).toEqual({ running: 2, total: 3 });
  });
});

describe('pickTodayEvents', () => {
  const today = new Date(2026, 9, 20, 9, 0);
  const ev = (date: string, impact: string, name: string): CalendarEvent => ({
    EventDate: date,
    Impact: impact,
    EventName: name,
  });

  it("keeps today's high-impact events when the feed marks impact", () => {
    const picked = pickTodayEvents(
      [
        ev('2026-10-20T00:00:00', 'High', 'CPI'),
        ev('2026-10-20T00:00:00', 'Low', 'Speech'),
        ev('2026-10-21T00:00:00', 'High', 'FOMC'),
      ],
      today,
    );
    expect(picked.map((e) => e.EventName)).toEqual(['CPI']);
  });

  it('reads ForexFactory impact icon classes (red = high)', () => {
    const picked = pickTodayEvents(
      [
        ev('2026-10-20T00:00:00', 'icon icon--ff-impact-red', 'CPI'),
        ev('2026-10-20T00:00:00', 'icon icon--ff-impact-yel', 'Speech'),
      ],
      today,
    );
    expect(picked.map((e) => e.EventName)).toEqual(['CPI']);
  });

  it('falls back to all of today when nothing is marked high, capped at max', () => {
    const rows = [1, 2, 3].map((i) => ev('2026-10-20T00:00:00', '', `E${i}`));
    expect(pickTodayEvents(rows, today, 2).map((e) => e.EventName)).toEqual(['E1', 'E2']);
  });

  it('formats the local date key', () => {
    expect(localDateKey(today)).toBe('2026-10-20');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  it('picks the unit by distance', () => {
    expect(relativeTime(new Date(now - 30_000), now)).toBe(fmt.format(-30, 'second'));
    expect(relativeTime(new Date(now - 5 * 60_000), now)).toBe(fmt.format(-5, 'minute'));
    expect(relativeTime(new Date(now - 3 * 3_600_000), now)).toBe(fmt.format(-3, 'hour'));
    expect(relativeTime(new Date(now - 2 * 86_400_000), now)).toBe(fmt.format(-2, 'day'));
  });

  it('follows the app language instead of the browser', () => {
    expect(relativeTime(new Date(now - 5 * 60_000), now, 'en')).toBe('5 minutes ago');
    expect(relativeTime(new Date(now - 5 * 60_000), now, 'nl')).toBe('5 minuten geleden');
  });

  it('shows a dash for a missing date', () => {
    expect(relativeTime(null, now)).toBe('—');
    expect(relativeTime(new Date('nope'), now)).toBe('—');
  });
});

describe('formatNumber / formatPrice', () => {
  it('uses the locale separators', () => {
    expect(formatNumber(8.2, 2, 'en')).toBe('8.20');
    expect(formatNumber(8.2, 2, 'nl')).toBe('8,20');
    expect(formatNumber(NaN, 2, 'en')).toBe('—');
  });

  it('picks fewer decimals for larger prices', () => {
    expect(formatPrice(72492.4, 'en')).toBe('72,492');
    expect(formatPrice(72492.4, 'nl')).toBe('72.492');
    expect(formatPrice(2.5, 'en')).toBe('2.50');
    expect(formatPrice(0.123456, 'en')).toBe('0.12346');
  });
});

describe('moodLevel', () => {
  it('buckets the Fear & Greed value', () => {
    expect(moodLevel(20)).toBe('fear');
    expect(moodLevel(50)).toBe('neutral');
    expect(moodLevel(80)).toBe('greed');
  });
});
