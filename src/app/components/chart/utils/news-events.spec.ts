import type { ForexCalendarEventDto } from 'src/app/modules/shared/models/chart/forex-calendar-event.dto';
import { buildNewsMarkers, newsEventLine, newsEventWindow } from './news-events';

const H = 3_600_000;
const D = 24 * H;
const day = Date.UTC(2026, 9, 20);

function ev(time: string | null, impact = 'icon icon--ff-impact-yel', date = '2026-10-20T00:00:00'): ForexCalendarEventDto {
  return { Id: 1, EventDate: date, EventTime: time, Currency: 'USD', Impact: impact, EventName: 'CPI m/m', Actual: '', Forecast: '0.3%', Previous: '0.4%' };
}

describe('newsEventWindow', () => {
  it('parses clock times as UTC one-minute windows', () => {
    expect(newsEventWindow(ev('8:30am'))).toEqual({ start: day + 8.5 * H, end: day + 8.5 * H + 60_000 });
    expect(newsEventWindow(ev('2:30pm'))!.start).toBe(day + 14.5 * H);
    expect(newsEventWindow(ev('12:00am'))!.start).toBe(day);
    expect(newsEventWindow(ev('12:15pm'))!.start).toBe(day + 12.25 * H);
  });

  it('treats All Day / Tentative / empty / unknown as the whole day and ranges as 7 days', () => {
    for (const t of ['All Day', 'Tentative', '', null, 'Day 2']) {
      expect(newsEventWindow(ev(t))).toEqual({ start: day, end: day + D });
    }
    expect(newsEventWindow(ev('23rd-30th'))).toEqual({ start: day, end: day + 7 * D });
  });
});

describe('buildNewsMarkers', () => {
  const candles = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({ x: day + i * H, h: 100 + i }));

  it('puts a clock-time event on the candle containing it, red for high impact', () => {
    const markers = buildNewsMarkers(candles, [ev('8:30am', 'icon icon--ff-impact-red'), ev('8:45am')]);
    expect(markers.length).toBe(1);
    expect(markers[0]).toEqual(expect.objectContaining({ x: day + 8 * H, price: 108, highImpact: true }));
    expect(markers[0].events.length).toBe(2);
  });

  it('marks every overlapped candle of an all-day event', () => {
    expect(buildNewsMarkers(candles, [ev('All Day')]).length).toBe(candles.length);
  });

  it('places future events on a virtual candle after the last one', () => {
    const markers = buildNewsMarkers(candles, [ev('1:30pm')]);
    expect(markers).toEqual([expect.objectContaining({ x: day + 14 * H, price: 110, highImpact: false })]);
  });

  it('drops events beyond the 30-day lookahead', () => {
    expect(buildNewsMarkers(candles, [ev('8:00am', undefined, '2026-12-31T00:00:00')])).toEqual([]);
  });
});

describe('newsEventLine', () => {
  it('shows currency, name, time and known values', () => {
    expect(newsEventLine(ev('8:30am'))).toBe('USD CPI m/m (8:30am)  F 0.3% · P 0.4%');
  });
});
