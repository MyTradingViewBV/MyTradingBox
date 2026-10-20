# Dashboard — investigation and plan

Status: **implemented** (2026-10-20). The page guide is [components/DASHBOARD.md](components/DASHBOARD.md).

Decisions taken after this plan:
- **No API changes.** T1 (`Dashboard/summary`) was dropped. Box statistics cover BTC across all 10 timeframes (10 calls). All-symbol numbers come from `BoxWatchlist/enriched`.
- **Route `/overview`** instead of `/dashboard`. Login, the guards and their tests already use `/dashboard` for Settings, so it stays the Settings alias.
- **Everyone sees the page.** The pending-notification count (an admin-only endpoint) is requested for admins only.
- **Market mood** uses alternative.me (Fear & Greed) and CoinGecko (BTC dominance). `api.alternative.me` was added to the CSP in `src/index.html` and `nginx.conf`, and to the service-worker data cache.
- **What's new** filters developer jargon on the client. The existing Release Notes page is unchanged.
- **Mini charts** are plain SVG components; no new chart library.

## Goal

A new Dashboard page with three tabs:

1. **Overview**: charts, numbers and system health (bot heartbeats, BTC 24h high/low, number of boxes and other stats from the API).
2. **What's new**: a user-friendly changelog.
3. **Timeframes**: small charts for all timeframes of one symbol.

On **web**, the page opens from a footer button. On **mobile**, it opens from the Settings page.

## What already exists

| Need | Already available | Where |
|---|---|---|
| Bot heartbeats | `GET BotHeartbeat?exchangeId=` (bot name, last heartbeat, message sent/received, colour: green = seen in the last 2 min) | `components/admin/services/heartbeat.service.ts`, `components/chart/system-status/` |
| BTC 24h high/low | `GET Candles/bybit?symbol=BTCUSDT&timeframe=1h&limit=24`, plus `Candles/live` for the current price | `chart.service.ts:199`, API `CandlesController.cs:31` |
| Mini charts for all timeframes | The same candles endpoint per timeframe: 1m, 3m, 6m, 12m, 24m, 1h, 4h, 1d, 1w, 1M | `chart-base.component.ts:232` |
| Box counts | `GET Boxes?symbol&timeframe` only works **per symbol + timeframe**, so a total count would take symbols × 10 calls | API `BoxesController.cs:42` |
| Other stats | Divergences, KeyZones, Levels, OrderBlocks, LiquidityLevels (all per symbol); `AiQueue`, `api/NotificationQueue/pending`, `api/Notifications/history`, `TradeOrders`, `TradeOrders/account-balance-pnl`, `BoxWatchlist/enriched`, `ForexCalendarEvents`, `MarketSymbols` | API controllers |
| Changelog | `assets/release-notes.mock.json` (generated at every deploy from `updates/RELEASE_LOG.md`), shown at `/settings/release-notes` | `components/settings/release-notes.component.ts` |
| Chart libraries | `lightweight-charts` 5, `chart.js` 4 + `ng2-charts` | `package.json` |
| Web/mobile detection | `effectiveUiMode()` (auto / web / mobile override) | `footer.component.ts:41` |

### Things to know

- **`/dashboard` is already taken.** It opens **Settings**, and the footer's ⚙️ Settings button navigates to `/dashboard`.
- **Change log entries are technical** (for example "Ignore stale profile PUTs", "Stabilize the cache"), and every summary is just "Improvement" or "Bug fix".
- **Baseline: unit tests don't build right now.** The cause is your uncommitted fixed-volume-profile change: `chart-base.component.spec.ts:1357` no longer matches `FixedProfileGeometry`. `npm run deploy` runs the tests and refuses a dirty working tree, so this has to be fixed or committed before any deploy.
- The API has almost no tests: only `Tests/NotificationSystemTests.cs`.

## Proposed content per tab

### Tab 1 — Overview (cards, refreshed every 60 s while the page is open)

**Market**
- BTC price now, 24h change %, 24h high/low, with a small 24h line chart. A range bar shows where the price sits between the low and the high.
- Next high-impact economic event (from `ForexCalendarEvents`), e.g. "CPI in 3 h".
- *Optional, external and free:* Fear & Greed index (alternative.me) and BTC dominance (CoinGecko global). Both work from the browser.

**System health**
- "9 / 10 bots running", plus one row per bot: green/amber/red dot, last seen ("2 min ago"), message sent/received. This reuses `HeartbeatService`.
- AI queue: number of pending items. Notification queue: pending and sent in the last 24 h.

**Boxes and signals** (needs the new summary endpoint, see T1)
- Total active boxes, long vs short, a bar chart per timeframe, and new boxes in the last 24 h.
- Divergences found in the last 24 h. Ready boxes on the watchlist.
- Open trade orders and account PnL (existing endpoint).

### Tab 2 — What's new
- A timeline grouped per version, with icons: ✨ New, 🛠 Fixed, ⚡ Improved.
- A "New since your last visit" badge, which also shows as a dot on the Dashboard button. The last-seen version is stored locally.
- Collapsible older versions.
- Wording: see question 4.

### Tab 3 — Timeframes
- A grid of 10 small charts (1m … 1M) for one symbol (default BTCUSDT, with a symbol picker). Each chart shows about 60 candles plus that timeframe's % change.
- Tap a chart to open `/mcb-chart/<symbol>/<tf>`.
- Charts load only when the tab is opened, and only the visible ones load.

## Subtasks

| ID | Repo | What | Depends on | Model | Risk |
|---|---|---|---|---|---|
| T1 | API | New read-only `GET /Dashboard/summary?exchangeId=`: box counts (total, long/short, per timeframe, last 24 h, blocked), divergences last 24 h, AI queue pending, notifications pending/sent 24 h, open orders. New controller only; nothing existing changes. Includes tests. | none | sonnet | low: new endpoint only |
| T2 | MyTradingBox | Dashboard page shell with 3 tabs, route, footer button (web only), Settings entry (mobile only), translations, page docs (`docs:check`) | none | sonnet | medium: touches footer, routes and settings |
| T3 | MyTradingBox | Overview tab: BTC card, health card, boxes/signals cards. Works without T1; the count cards stay hidden until the endpoint exists. | T2, (T1) | sonnet | low |
| T4 | MyTradingBox | What's new tab, plus the "new since last visit" dot | T2 | sonnet | low |
| T5 | MyTradingBox | Timeframes tab with mini charts (lightweight-charts) | T2 | sonnet | low |

T3, T4 and T5 can run in parallel after T2. T1 can run in parallel with everything. Following your earlier instruction, no tickets are created for these repos.

## Open questions

See the chat message.
