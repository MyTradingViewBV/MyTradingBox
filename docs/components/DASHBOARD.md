# Dashboard

## Purpose

The Dashboard gives one overview of the market, the bots and the app itself. It has three tabs: **Overview**, **What's new** and **Timeframes**.

## Route and Access

- Route: `/overview` (optional `?tab=overview|whats-new|timeframes`)
- Required access: authenticated user
- Entry points: the **Dashboard** footer button in web mode; the **Dashboard** row under Settings → Actions in mobile mode
- `/dashboard` is a different route: it stays the alias for the Settings/home page.

## Available Functions

### Overview

Fast cards reload every minute while the tab is open. All cards reload when the refresh button is pressed.

| Card | Source | Notes |
|---|---|---|
| BTC last 24 hours | `Candles/bybit` (BTCUSDT, 12m × 120) | Price, 24 h change, sparkline with hover read-out, low/high and a range bar. "Open chart" opens `/mcb-chart/BTCUSDT`. |
| Market mood | alternative.me Fear & Greed, CoinGecko global | External and cached for 10 minutes. The card is hidden when both sources fail. |
| Bot health | `BotHeartbeat` (via `HeartbeatService`) | "x / y running", one row per bot with status dot, status text for screen readers, and last heartbeat as relative time. |
| BTC boxes | `Boxes` for each of the 10 chart timeframes | Total, long/short, new in the last 24 h, plus a bar per timeframe. |
| Watchlist (all symbols) | `BoxWatchlist/enriched` | Setups, symbols, long/short and the five largest statuses. Hidden when the call fails. |
| Queues | `AiQueue`; `api/NotificationQueue/pending` (admins only) | The notification queue is only requested for admins, because the endpoint is admin-only. |
| Economic events today | `ForexCalendarEvents` (today) | High-impact events when the feed marks impact, otherwise all of today's events; at most five. |

### What's new

- Built from the same `assets/release-notes.mock.json` as Release Notes. The data is generated at deploy time.
- Developer-only entries are hidden: maintenance, docs, tests, release bookkeeping, code identifiers and tooling jargon.
- "Add …" is trimmed from new items. Changes are grouped as ✨ New, 🛠 Fixed and ⚡ Improved.
- A "New for you" badge marks releases newer than the last one you saw. On a first visit, only the latest release gets the badge. Stored locally under `mtb.dashboard.lastSeenRelease`.
- Five releases are shown first, then "Show older releases". Groups longer than six items get "Show all".

### Timeframes

- Ten small candlestick charts (1m, 3m, 6m, 12m, 24m, 1h, 4h, 1d, 1w, 1M), each with 60 candles, the % change and the last price.
- Hover a chart to see O/H/L/C. Tap a chart to open `/mcb-chart/<symbol>/<timeframe>`.
- Symbol picker: BTCUSDT plus every symbol with collected boxes. The choice is remembered locally.

## States and Exceptions

- **Loading:** cards show a pulsing placeholder.
- **Failure:** every source fails on its own. A failed call shows an empty or "no data" state, or hides its card, and never breaks the page.
- **External sources blocked:** the Market mood card is hidden. Both hosts are allowed in the CSP (`src/index.html`, `nginx.conf`).
- Numbers and relative times follow the app language (Settings → Language), not the browser locale.
- The chosen tab is remembered locally (`mtb.dashboard.tab`).

## Roles and Navigation

Any authenticated user can open the Dashboard. Admins also see the pending-notification count. The page changes no data.

## Implementation References

- `src/app/components/dashboard/` (page, tabs, `dashboard-data.service.ts`, `dashboard-stats.ts`, `charts/`)
- `src/app/components/footer/footer.component.html` (web entry)
- `src/app/components/settings/settings.component.html` (mobile entry)

## Look and feel

Panels use `mtb.panel` with the large radius. The active tab uses the accent gradient. The sparkline and box bars use the orange accent, and candles use the chart's up/down colours. Status dots use `--mtb-success` and `--mtb-danger` and always come with text. All colours are `--mtb-*` tokens, so dark and light mode follow automatically.

Verification date: 2026-10-20.
