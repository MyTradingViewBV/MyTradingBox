/**
 * ForexFactory calendar event as returned by the ForexCalendarEvents API (PascalCase).
 * Filled hourly by the NewsBot; EventTime is free text ("8:30am", "All Day", "Tentative", "23rd-30th").
 */
export interface ForexCalendarEventDto {
  Id: number;
  EventDate: string;
  EventTime: string | null;
  Currency: string | null;
  /** ForexFactory impact icon class, e.g. "icon icon--ff-impact-red" / "-ora" / "-yel" / "-gra". */
  Impact: string | null;
  EventName: string;
  Actual: string | null;
  Forecast: string | null;
  Previous: string | null;
  DetailId?: string | null;
  ScrapedAt?: string | null;
}
