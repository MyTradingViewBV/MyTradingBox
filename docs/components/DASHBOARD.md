# Dashboard

## Purpose

The Dashboard gives one overview of the market, the bots and the app itself. It has five tabs: **Overview**, **What's new**, **Timeframes**, **Tests** and **Report**.

## Route and Access

- Route: `/overview` (optional `?tab=overview|whats-new|timeframes|tests|report`)
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
- Each release shows its deploy date and time in the device's own time zone (never UTC), written in the app language. The generator stores the moment as an ISO instant (`timestamp`); data without it falls back to the date only.
- Five releases are shown first, then "Show older releases". Groups longer than six items get "Show all".

### Timeframes

- Ten small candlestick charts (1m, 3m, 6m, 12m, 24m, 1h, 4h, 1d, 1w, 1M), each with 60 candles, the % change and the last price.
- Hover a chart to see O/H/L/C. Tap a chart to open `/mcb-chart/<symbol>/<timeframe>`.
- Symbol picker: BTCUSDT plus every symbol with collected boxes. The choice is remembered locally.

### Tests

- Shows how many automated tests the code has per component: totals (tests, spec files, unit, smoke, end-to-end) and one row per component with a bar, sorted most-tested first.
- Every folder under `src/app/components/` gets a row, so components without tests stand out in red. Shared modules (`shared/auth`, `shared/services`, …), store slices, helpers, the app root and `e2e/` get their own rows.
- Data: `assets/test-counts.json`, generated at every deploy by `scripts/generate-test-counts.js` (`npm run test-counts:sync`). It counts `it(…)` / `test(…)` calls in `*.spec.ts` files, skipping commented-out code; `.smoke.spec.ts` counts as smoke, `e2e/` as end-to-end.
- "Counted" shows when the counts were made, in device time.

### Report (testing stage)

Creates a GitHub issue in `MyTradingViewBV/MyTradingBox`. It replaces the old "Send Feedback to GitHub" dialog in Settings. That dialog posted to `api/feedback/issues`, an endpoint the API never had, so it always ended in the manual link.

- Choose **Bug** (label `bug`, title prefix `[Bug]`) or **Feature** (label `enhancement`, prefix `[Feature]`), then enter a title (required) and a description.
- Screenshot (optional, max 10 MB): paste with Ctrl+V anywhere on the tab, drag it onto the drop zone, or choose a file. Text pasting into the fields keeps working.
- **With a GitHub token** (one-click):
  1. The image is committed to `issue-images/<UTC time>-<random>.<ext>` on the `issue-images` branch. The branch is created from the default branch the first time.
  2. The issue is created with the image inline and a footer with the app version, UI mode and browser.
  3. If GitHub rejects the label (422), the issue is created without it.
- **Without a token**: "Open in GitHub" opens the prefilled new-issue page (title, body, label). "Copy image" puts the screenshot on the clipboard as PNG, ready to paste into GitHub's editor.
- **Token:** a fine-grained personal access token for `MyTradingViewBV/MyTradingBox` with *Issues* and *Contents*: read & write.
  - It is checked against `GET /user` before it is saved.
  - It is stored on this device only (`localStorage`, `mtb.dashboard.githubToken`) and never in the app bundle.
  - It is sent only to `api.github.com`. Our API interceptor adds our session token only to `apiUrl` requests.
  - "Forget token" removes it.

## States and Exceptions

- **Loading:** cards show a pulsing placeholder.
- **Failure:** every source fails on its own. A failed call shows an empty or "no data" state, or hides its card, and never breaks the page.
- **External sources blocked:** the Market mood card is hidden. Both hosts are allowed in the CSP (`src/index.html`, `nginx.conf`).
- Numbers and relative times follow the app language (Settings → Language), not the browser locale.
- The chosen tab is remembered locally (`mtb.dashboard.tab`).
- **Report errors:** an invalid token (401), a token without repo access (403/404) or GitHub being unreachable shows a short message. "Open in GitHub instead" then offers the manual route.
- `api.github.com` is allowed in the CSP (`src/index.html`, `nginx.conf`).

## Roles and Navigation

Any authenticated user can open the Dashboard. Admins also see the pending-notification count. Only the Report tab writes anything, and it writes to GitHub with the user's own token. Nothing in our API or database changes.

## Implementation References

- `src/app/components/dashboard/` (page, tabs, `dashboard-data.service.ts`, `dashboard-stats.ts`, `charts/`, `report-tab/`)
- `src/app/components/footer/footer.component.html` (web entry)
- `src/app/components/settings/settings.component.html` (mobile entry)

## Look and feel

Panels use `mtb.panel` with the large radius. The active tab uses the accent gradient. The sparkline and box bars use the orange accent, and candles use the chart's up/down colours. Status dots use `--mtb-success` and `--mtb-danger` and always come with text. All colours are `--mtb-*` tokens, so dark and light mode follow automatically.

Verification date: 2026-10-20.
