# Release Log

This file is updated automatically after successful deploys.
Entries use the format "- <New|Fixed|Improved>: <change>".

## Unreleased

Changes:
- Improved: MCB panel momentum visualization: prediction lines replaced by momentum trendlines from the bot (exact-timeframe only)
- New: Momentum trendline visualization: purple oscillator lines on Slow Momentum Wave, brown price anchor lines on the price chart
- New: MCB panel trendline toggles: "Momentum-trendlijnen MCB" (oscillator) and "Momentum-trendlijnen Prijs" (price)
- Improved: Enable "Voorlopige trendlijnen" (Developing/unconfirmed lines) toggle for preview lines before confirmation
- Improved: Removed legacy green/red divergence prediction lines and percentage labels from MCB panel
- New: White Money Flow trendlines in the MCB panel (long-term solid, short-term thin dashed) with a "Money Flow trendlines" toggle
- Improved: Trendlines with a confirmed breakout or invalidation are no longer drawn; stale bot snapshots (older generation) are ignored
- Improved: A failed trendline fetch no longer clears the lines; the last snapshot stays until the next good response
- Improved: Trendlines waiting for a new pivot after a breakout are drawn dimmed (same colour, half opacity)

---
## Early Development Notes

Feature wishlist captured before automated release logging:

- Split the position setting into separate long and short positions
- Editable drawings (high/low) with a delete option and profit/loss percentage
- Smaller coin/symbol selection so all icons fit on a phone screen
- Support for the latest Android version (tablet error)
- Watchlist rows shown as colored progress bars per symbol, based on box data
- Edit and move long/short boxes directly in the chart, TradingView-style

---
Deploy: 2026-04-01T15:42:16
Version: 0.1.46
Head: a314b9c
Changes:
- New: Add new 180x180 icon PNG file to assets/icons directory
- New: Add toast notifications and ruler drawing tool
- Improved: Enhance error handling
- Improved: Refactor footer component
- Improved: Enhance push notification permission handling
- Improved: Refactor segment tabs to dropdown
- Improved: Enhance watchlist symbol display
- New: Add connectivity tests
- New: Implement close button component

---
Deploy: 2026-04-02T19:22:25
Version: 0.1.50
Head: dda824c
Changes:
- New: Implement UI mode selection and enhance footer with web-specific button
- New: Implement admin role management
- Improved: Enhance routing and UI components
- New: Implement save functionality for alert settings
- Improved: Enhance footer height calculation

---
Deploy: 2026-04-03T09:11:15
Version: 0.1.53
Head: 6ee1492
Changes:
- New: Add Trade Assistant feature with chat functionality and UI enhancements

---
Deploy: 2026-04-03T09:21:30
Version: 0.1.55
Head: bab0253
Changes:
- Improved: Modify login error handling

---
Deploy: 2026-04-03T09:57:01
Version: 0.1.59
Head: 08256da
Changes:
- New: Implement light theme support
- Improved: Enhance settings component functionality

---
Deploy: 2026-04-03T10:56:08
Version: 0.1.63
Head: 9c3cd78
Changes:
- Improved: Enhance localStorage management with user-scoped keys
- Improved: Improve chart component functionality

---
Deploy: 2026-04-03T11:48:23
Version: 0.1.70
Head: 9ea4422
Changes:
- Improved: Enhance watchlist and add-symbol components with exchange information
- Improved: Improve user symbol management

---
Deploy: 2026-04-03T13:07:22
Version: 0.1.73
Head: 42505f6
Changes:
- Improved: Enhance chart component timeframes visibility
- Improved: Improve watchlist exchange handling
- Improved: Update service worker error notification logic

---
Deploy: 2026-04-03T17:15:37
Version: 0.1.80
Head: b11ca7c
Changes:
- Improved: Enhance user ID handling in services
- Improved: Improve push notification management

---
Deploy: 2026-04-03T17:35:09
Version: 0.1.81
Head: 7856ff4
Changes:
- Improved: Enhance alert settings with new toggle functionality
- Improved: Improve watchlist progress bar styling

---
Deploy: 2026-04-03T18:18:44
Version: 0.1.86
Head: 5697773
Changes:
- Improved: Enhance watchlist and alerts settings
- Improved: Improve chart component logic
- New: Add notification handling

---
Deploy: 2026-04-08T13:19:54
Version: 0.1.89
Head: 3ba68a1
Changes:
- New: Implement exchange tabs in watchlist component

---
Deploy: 2026-04-10T12:47:12
Version: 0.1.97
Head: 2162b27
Changes:
- New: Add web chart component with test orders functionality
- New: Add bug/feature toggle to GitHub feedback form and update title prefixing
- New: Implement GitHub feedback feature

---
Deploy: 2026-04-10T16:15:11
Version: 0.1.99
Head: d6309a8
Changes:
- Improved: Enhance web chart component with touch event handling
- Improved: Improve test orders panel

---
Deploy: 2026-04-10T16:30:01
Version: 0.1.102
Head: 33bf5fc
Changes:
- Improved: Enhance web chart component with order button state management and improve dropdown styling
- Improved: Enhance web chart component with selected order display
- Improved: Improve web orders panel functionality

---
Deploy: 2026-04-10T16:43:06
Version: 0.1.105
Head: e44c6f3
Changes:
- Improved: Modify web orders panel options

---
Deploy: 2026-04-10T16:46:00
Version: 0.1.106
Head: 94b1500
Changes:
- Improved: Enhance web chart component order handling

---
Deploy: 2026-04-10T16:50:15
Version: 0.1.107
Head: 0f11ad7
Changes:
- Improved: Adjust selected order display logic

---
Deploy: 2026-04-14T10:26:54
Version: 0.1.108
Head: e3fd805
Changes:
- Improved: Enhance web chart component with exchange handling

---
Deploy: 2026-04-14T12:56:34
Version: 0.1.112
Head: 1f0fe02
Changes:
- Improved: Enhance web chart and orders panel with transaction cost and side handling

---
Deploy: 2026-04-14T14:26:19
Version: 0.1.114
Head: e3e5605
Changes:
- Improved: Modify watchlist component for exchange-specific user symbols

---
Deploy: 2026-04-14T16:48:05
Version: 0.1.115
Head: 485d69d
Changes:
- Improved: Refactor chart services and plugins for improved type safety and performance

---
Deploy: 2026-05-05T11:28:02
Version: 0.1.120
Head: 5dc91ea
Changes:
- Improved: Enhance login component with debug panel
- Improved: Improve order management features

---
Deploy: 2026-05-20T08:56:25
Version: 0.1.123
Head: 7cbb12f
Changes:
- New: Add comprehensive documentation and components for MyTradingBox

---
Deploy: 2026-05-20T09:59:39
Version: 0.1.126
Head: 7f97b4b
Changes:
- New: Implement price alert feature with UI and service integration chore: update version to 0.1.125 and release notes fix: adjust chart tick formatting and improve label readability

---
Deploy: 2026-05-20T10:33:22
Version: 0.1.128
Head: 628ee78
Changes:
- Improved: Enhance chart performance with optimized resize handling and change detection

---
Deploy: 2026-05-20T13:36:02
Version: 0.1.132
Head: 80227fa
Changes:
- Improved: Refactor code structure and remove redundant sections for improved readability and maintainability

---
Deploy: 2026-07-13T16:24:56
Version: 0.1.159
Head: 59710a1
Changes:
- New: New chart simple

---
Deploy: 2026-08-20T11:41:18
Version: 0.2.7
Head: 0aa8010
Changes:
- Fixed: Fix

---
Deploy: 2026-09-04T16:23:31
Version: 0.2.14
Head: f48ad94
Changes:
- New: Add Chart V3 component with enhanced box mode functionality and authentication persistence

---
Deploy: 2026-09-07T10:06:16
Version: 0.2.16
Head: e330573
Changes:
- New: Implement Chart V3 component with enhanced box mode functionality and authentication persistence

---
Deploy: 2026-09-07T13:38:26
Version: 0.2.17
Head: 5f9b218
Changes:
- Improved: Enhance exchange streaming capabilities and default exchange selection

---
Deploy: 2026-09-11T15:36:11
Version: 0.2.20
Head: 1e9b304
Changes:
- New: Add custom timeframe live candle seeding function and integrate into web chart component

---
Deploy: 2026-09-30T11:09:58
Version: 0.2.21
Head: d9d8da0
Changes:
- New: Add footer component with navigation and UI mode detection

---
Deploy: 2026-09-30T15:00:59
Version: 0.2.23
Head: ba7e115
Changes:
- New: Add unit tests for settings and token storage services

---
Deploy: 2026-10-01T16:02:49
Version: 0.2.24
Head: 218ea1e
Changes:
- Improved: Enhance layout and styling of Market Cipher B panel

---
Deploy: 2026-10-02T09:00:50
Version: 0.2.27
Head: c6df327
Changes:
- Improved: Enhance chart interaction and axis tick functionality

---
Deploy: 2026-10-02T09:27:06
Version: 0.2.28
Head: ce9b22f
Changes:
- New: Add aux panel settings for Market Cipher B with toggle functionality

---
Deploy: 2026-10-02T23:38:17
Version: 0.2.34
Head: 5636e71
Changes:
- New: MCB prediction lines
- New: Key zone layers and linked-scale alignment

---
Deploy: 2026-10-04T09:24:01
Version: 0.2.40
Head: 7c9121c
Changes:
- New: TradingView default view
- New: Axis double-click/double-tap to latest candle

---
Deploy: 2026-10-06T11:46:10
Version: 0.2.41
Head: 885bb2c
Changes:
- New: One interaction state machine
- New: Enforced service-wide
- Fixed: Live-follow audit fixes (drag release, stale state after zoom)
- New: Explicit realtime viewport following
- Improved: Main chart + MCB pane share one horizontal write path
- New: One synchronized crosshair across main and MCB panes
- Fixed: Live Y refit only when needed
- Fixed: Fresh follow state on time reset
- New: Predictable double-click resets for price and time axes
- Fixed: Price-axis click keeps auto scale; drag exclusivity; neutral end hook
- New: Anchored manual Y scaling from the price axis
- New: Pan from the gesture start state via the TimeScale
- New: Live-follow groundwork
- Fixed: Start-state span for drag/pinch
- Fixed: Wire MCB wheel offset
- New: Focal-anchored two-pointer pinch zoom
- New: Pointer-anchored horizontal wheel zoom
- Fixed: Harden time-axis drag end
- Fixed: Rebase touch start
- Fixed: Dedupe moves
- New: Anchored TradingView-style time-axis drag scaling
- Fixed: TimeScale audit fixes — time-linear hit-tests
- Fixed: No stale state
- Improved: One authoritative shared TimeScale for all panes
- Fixed: Logo only on main chart
- Fixed: No latest-candle vertical
- Fixed: In-place MCB updates
- Fixed: Alignment

---
Deploy: 2026-10-05T22:41:57
Version: 0.2.48
Head: 1e3f803
Changes:
- New: One page-wide crosshair; pinned crosshair never blocks axes
- New: Market Cipher B Pine defaults
- New: Momentum dots toggle
- New: Compact two-line current-price label with candle countdown
- Fixed: Login shows the deployed version from version.json

---
Deploy: 2026-10-06T14:25:17
Version: 0.2.49
Head: 26ee157
Changes:
- 2026-10-06 26ee157 Merge improve-chart: evening chart/MCB/login work (0.1.207)
- 2026-10-06 200d338 - Improved: Refactor release log for clarity and organization - New: Implement early development notes for feature wishlist - Improved: Consolidate duplicate deployment entries in release log - Improved: Enhance formatting for better readability in release log
- 2026-10-06 8762e78 docs(audit): timestamp first audit report, add re-audit after fix-audit
- 2026-10-06 7ca4e17 refactor(templates): re-arm ESLint and remove template function calls
- 2026-10-06 9abdeb4 docs: document audit fixes (deploy gate, CSP, logout, watchlist leak)
- 2026-10-06 c999496 refactor(auth): route admin/push calls through the token interceptor
- 2026-10-06 468fc68 fix(rxjs): clean up leaking subscriptions in orders, settings, watchlist
- 2026-10-06 c4147c8 fix(sql): add missing timeframe column to chart_state migration
- 2026-10-06 c301fbc chore(env): point dev environment at local API
- 2026-10-06 c2e8461 fix(auth): revoke session and drop push subscription on logout
- 2026-10-06 82c5510 feat(security): add Content-Security-Policy meta tag
- 2026-10-06 793f95a build(deploy): gate deploys on clean tree, lint and tests
- 2026-10-06 69b86ec fix(security): remove hardcoded fallback user ID in UserSymbolsService
- 2026-10-06 10f1012 build(deps): bump Angular to 22.2.1 and @ngrx/store to stable 22.0.1
- 2026-10-06 7b6de8e chore: bump version to 0.1.200 and update release log for version 0.2.41
- 2026-10-06 1e3f803 chore(release): bump to 0.2.48, sync release notes and deploy log
- 2026-10-06 e72e5c6 fix(login): show the deployed version from version.json
- 2026-10-06 30ea943 feat(chart): compact two-line current-price label with candle countdown
- 2026-10-06 ccc54bf feat(mcb): Market Cipher B Pine defaults, momentum dots toggle
- 2026-10-06 e32c185 feat(chart): one page-wide crosshair x; pinned crosshair never blocks axes

---
Deploy: 2026-10-06T14:37:08
Version: 0.2.50
Head: 61d89cd
Changes:
- 2026-10-06 61d89cd chore: bump version to 0.2.49 and update release notes feat(chart): implement divergence caching and improve performance test(chart): add tests for divergence toggling and fetching style(chart): enhance header styling for better visibility fix(chart): ensure divergences are fetched correctly based on candle range

---
Deploy: 2026-10-06T15:22:45
Version: 0.2.51
Head: 4a11745
Changes:
- 2026-10-06 4a11745 feat(chart): implement chart settings panel with persistence for user selections feat(chart): add capital flow tiers to chart settings feat(chart): enhance key zone settings with timeframe toggles fix(chart): ensure proper state persistence for key zone timeframes fix(chart): update reducer logic to maintain flags for unavailable timeframes test(chart): add unit tests for chart settings persistence and key zone toggles chore: bump version to 0.1.209

---
Deploy: 2026-10-06T15:35:51
Version: 0.2.52
Head: 7733158
Changes:
- 2026-10-06 7733158 chore: bump version to 0.2.51 and update release notes feat(chart): enhance chart layout for iPhone safe areas and fullscreen mode

---
Deploy: 2026-10-06T15:40:00
Version: 0.2.53
Head: 90e00b7
Changes:
- 2026-10-06 90e00b7 chore: bump version to 0.2.52 and update release notes; add 1-minute timeframe to charts

---
Deploy: 2026-10-06T19:13:50
Version: 0.2.54
Head: 27fad37
Changes:
- 2026-10-06 27fad37 feat(chart): TradingView-style drawing rail, pen, rectangle, locking, fib 0.886
- 2026-10-06 37e556e feat(network): enhance network status handling with type definitions and improved error handling

---
Deploy: 2026-10-07T10:56:57
Version: 0.2.55
Head: 01dde7f
Changes:
- 2026-10-07 01dde7f refactor: remove web orders panel component and its styles
- 2026-10-06 86761a3 chore: bump version to 0.2.54 and update release notes
- 2026-10-06 b754162 fix(chart): default to BTC when the stored symbol is not on the selected exchange

---
Deploy: 2026-10-07T11:44:04
Version: 0.2.56
Head: 0e6982c
Changes:
- 2026-10-07 0e6982c chore: bump version to 0.2.55, deploy log and code audit report
- 2026-10-07 03749b3 feat(mcb): drawing on the MCB panel; prediction lines on the WPF candles

---
Deploy: 2026-10-19T18:32:25
Version: 0.2.57
Head: 72fccb7
Changes:
- 2026-10-14 72fccb7 Merge main into big-task/mcb-part-b
- 2026-10-14 fd518d5 Chart: show API and bot online status in the chart toolbar
- 2026-10-13 b788ee2 docs: align RULES.md color rule with the style guide
- 2026-10-13 86b8262 Add screenshot regression tests for login, onboarding, settings and watchlist
- 2026-10-13 0afbb91 Harden screen capture tool: localhost-only guards, fail on expired session, stricter compare
- 2026-10-13 d00b1c8 Watchlist: visible press feedback on swipe delete
- 2026-10-13 a9428be Merge T5: restyle watchlist, add symbol and progress bar
- 2026-10-13 2095d66 Remove leftover global footer rules so the footer follows the tokens in light mode
- 2026-10-13 7d38672 Merge T3: restyle footer, shared buttons and toast
- 2026-10-13 43c0142 Merge T4: restyle settings, alerts, release notes and feedback dialog
- 2026-10-13 3f81661 Settings: exchange select keeps its input-box border and background
- 2026-10-13 490bb78 Merge T6: restyle orders, balance and coin info
- 2026-10-13 b5edfe8 Orders primary button keeps gradient on hover, docs wording, drop unused keyframes
- 2026-10-13 1a8119e Watchlist: stronger support/resistance bars, distinct silver and platinum in light theme
- 2026-10-13 45384f4 Footer: compact icon tile, 56px bar on desktop like before, solid web options sheet
- 2026-10-13 af5754c Merge T8: restyle onboarding overlay
- 2026-10-13 e9e2452 Orders and balance: neutral tiles in light mode, tidy mobile order header
- 2026-10-13 0076d3b Onboarding: derive step dots from total, drop stray icon box on buttons
- 2026-10-13 74fb261 Restyle watchlist and add-symbol screens to the shared design tokens
- 2026-10-13 2db4057 Document look and feel of settings, alerts and release notes
- 2026-10-13 69e1d2a Restyle settings, alerts, release notes and feedback dialog with design tokens
- 2026-10-13 d6a3218 Merge T7: restyle admin and contact screens
- 2026-10-13 1b5f865 Fix send button hover, remove BOMs, trim contact docs note
- 2026-10-13 8646b80 Admin snackbar width, contact row spacing
- 2026-10-13 47cc3a1 Restyle orders, balance and coin info screens with the shared tokens
- 2026-10-13 41ff6f2 Toast on status tokens, footer docs look and feel
- 2026-10-13 2e1a87b Restyle shared back, close and refresh buttons on tokens
- 2026-10-13 c1026da Restyle footer navigation and clean up stale app.css
- 2026-10-13 8421a87 Restyle onboarding overlay like the login page
- 2026-10-13 afc0ea4 Restyle admin and contact screens to the login look
- 2026-10-13 21f971c Merge T2: Playwright screen-capture setup for before/after comparison
- 2026-10-13 84816cb Merge T1: shared design tokens, mtb mixins, Inter, restyled global classes
- 2026-10-13 9a5334d docs: correct focus-ring specificity note
- 2026-10-13 f17c777 Format capture spec
- 2026-10-13 5d61ca5 Add Playwright screen-capture setup for before/after restyle comparison
- 2026-10-13 70e8f3a docs: add style guide for the design tokens and mtb mixins
- 2026-10-13 9d33dad style: load Inter and restyle the shared global classes
- 2026-10-13 67d049b style: add shared design tokens and mtb Sass mixins, login uses them
- 2026-10-13 fe63866 feat(login): restyle login page to the new MyTradingBox design
- 2026-10-13 1480506 chore: add Playwright e2e tests and Playwright MCP server
- 2026-10-13 024954b chore: add Playwright e2e tests and Playwright MCP server
- 2026-10-11 3187b2d docs(mcb): handoff synced with follow-ups T16-T21 and soak test results
- 2026-10-11 5cec190 Include exchange id in the predictions context key
- 2026-10-11 02fce63 Dim WaitingForNewPivot trendlines
- 2026-10-11 849d04d Fix T19 context-switch test to rebuild panes
- 2026-10-11 2cc933e Keep last trendline snapshot when a predictions fetch fails
- 2026-10-11 5678757 docs(mcb): handoff synced, Part B done with end-to-end results
- 2026-10-11 dcaf637 MCB: numeric-string Generation, distinct short-term MF dash, extra specs
- 2026-10-11 c71475d MCB chart: white Money Flow lines, moneyFlowLines toggle, generation gate, release log
- 2026-10-11 91b3cd7 MCB trendlines: Money Flow dataset builder, hide broken lines, extended types
- 2026-10-11 52ee447 docs(mcb): handoff update with calibration and end-to-end verification
- 2026-10-10 d9e8607 feat(mcb): render momentum trendlines from DivPredictionBot
- 2026-10-08 b9b5707 chore: bump version to 0.2.56 and update release notes with new feature details

---
Deploy: 2026-10-19T19:10:46
Version: 0.2.58
Head: 05991c7
Changes:
- 2026-10-19 05991c7 Release v0.2.57
- 2026-10-19 75954e7 Chart status: ping /Exchanges instead of the API root

---
Deploy: 2026-10-19T19:37:13
Version: 0.2.59
Head: b1dfb55
Changes:
- 2026-10-19 b1dfb55 MCB panel: colour momentum trendlines green/red by regime instead of purple
- 2026-10-19 6d12f04 Heartbeat status: one rule for admin and toolbar, click opens heartbeats
- 2026-10-19 f6fb3b3 Release v0.2.58

---
Deploy: 2026-10-19T19:40:12
Version: 0.2.60
Head: 53850c4
Changes:
- 2026-10-19 53850c4 MCB panel: dashed green/red Money Flow lines, solid divergence lines
- 2026-10-19 cc287c8 Release v0.2.59

---
Deploy: 2026-10-19T19:41:48
Version: 0.2.61
Head: b85caa4
Changes:
- 2026-10-19 b85caa4 Release v0.2.60

---
Deploy: 2026-10-19T19:47:59
Version: 0.2.62
Head: 2209a81
Changes:
- 2026-10-19 2209a81 Release v0.2.61
- 2026-10-19 94bb6b1 Reload once when a lazy chunk is gone after a deploy
- 2026-10-19 7803b43 Avoid two noisy failed requests: ngsw/state 404 and early BotHeartbeat

---
Deploy: 2026-10-19T19:51:28
Version: 0.2.63
Head: 8cc0953
Changes:
- 2026-10-19 8cc0953 Deploy: publish gh-pages without line-ending conversion
- 2026-10-19 ccd1839 Release v0.2.62

---
Deploy: 2026-10-19T20:14:29
Version: 0.2.64
Head: eb49911
Changes:
- 2026-10-19 eb49911 Charts: TradingView look (legend, price label, panes, right offset, colours)
- 2026-10-19 3bf42ac Release v0.2.63

---
Deploy: 2026-10-19T20:23:37
Version: 0.2.65
Head: a716fb3
Changes:
- 2026-10-19 a716fb3 Charts: price scale spacing and separators, corner logo, MCB auto scale
- 2026-10-19 b96eb87 Release v0.2.64

---
Deploy: 2026-10-19T20:28:35
Version: 0.2.66
Head: 9aa16be
Changes:
- 2026-10-19 9aa16be Charts: tone down zones, levels and markers (TradingView look)
- 2026-10-19 3a5f949 Release v0.2.65

---
Deploy: 2026-10-19T20:35:35
Version: 0.2.67
Head: f5ee9a6
Changes:
- 2026-10-19 f5ee9a6 PWA: no "App Error" notification for a failed update; in-app reload when broken
- 2026-10-19 c319c7a Release v0.2.66

---
Deploy: 2026-10-19T20:43:54
Version: 0.2.68
Head: aea705b
Changes:
- 2026-10-19 aea705b Plans page: subscription plans from the design (information only)
- 2026-10-19 47d0801 Release v0.2.67

---
Deploy: 2026-10-19T20:52:07
Version: 0.2.69
Head: 92aea01
Changes:
- 2026-10-19 92aea01 Watchlist: flow forecast wave per coin
- 2026-10-19 b3f9452 Release v0.2.68

---
Deploy: 2026-10-19T21:22:44
Version: 0.2.71
Head: 0fddd84
Changes:
- 2026-10-19 0fddd84 Position tool: one-click placement, side enforced long/short (TradingView parity)
- 2026-10-19 f7776b9 Release v0.2.69

---
Deploy: 2026-10-20T18:25:37
Version: 0.2.73
Head: 386974c
Changes:
- 2026-10-20 386974c Login: single scroller, corner-anchored candle decoration
- 2026-10-19 481b0b9 chore: deploy artifacts for v0.2.70

---
Deploy: 2026-10-20T18:52:29
Version: 0.2.74
Head: 63d3fab
Changes:
- 2026-10-20 63d3fab Legend icon via the symbolIconSrc pipe, not a template call
- 2026-10-20 0c435dc Charts: centred watermark, symbol icon in the legend, tighter price axis
- 2026-10-20 a93d08c Release v0.2.72

---
Deploy: 2026-10-20T19:48:37
Version: 0.2.75
Head: 1c1dba5
Changes:
- 2026-10-20 1c1dba5 Merge big-task/fib-cursor-fvp: cursor tool, axis scaling while drawing, Fixed Range Volume Profile
- 2026-10-20 4dc93c6 Disable panel close while saving and correct the parity log wording
- 2026-10-20 ae39cb6 Log cursor tool, mid-drawing axis scaling and Fixed Volume Profile in the parity doc
- 2026-10-20 5527b15 Keep one selection across drawings and profiles, locked drawings first, ignore stale profile PUTs
- 2026-10-20 814b2ff Clip profile hit geometry to the plot, stabilize the cache, align ExtendRight with the bot
- 2026-10-20 be8dbc3 Ignore zero-width fixed ranges and emit drawingSelected on selection
- 2026-10-20 4745c26 Clear the fixed volume profile layer when a chart page is destroyed
- 2026-10-20 7dc08dc Load, create, edit, move and delete fixed volume profiles on the chart
- 2026-10-20 e7995d3 Add fixed volume profile layer state and Chart.js renderer
- 2026-10-20 dd957f1 Add fixed-volume-profile range tool with band preview and toolbox button
- 2026-10-20 055418c Add fixed range volume profile computation utility
- 2026-10-20 1bd5743 Add Fixed Volume Profile CRUD methods to ChartService
- 2026-10-20 115455b Allow axis scaling and pinch while a drawing tool is active
- 2026-10-20 ca6cede Add cancelPenStroke to drop a pen stroke without saving it
- 2026-10-20 d2ecd5e Add Cursor tool button to drawing toolbox and lock in auto-deselect tests
- 2026-10-20 d5a0a95 Release v0.2.74

---
Deploy: 2026-10-20T20:25:53
Version: 0.2.76
Head: 6818071
Changes:
- 2026-10-20 6818071 Add Dashboard page with overview, what's new and timeframe tabs
- 2026-10-20 14a1fd8 Release v0.2.75

---
Deploy: 2026-10-20T20:39:01
Version: 0.2.77
Head: e9b36bf
Changes:
- 2026-10-20 e9b36bf Move GitHub issue reporting to a Dashboard Report tab with screenshots
- 2026-10-20 07692f9 Release v0.2.76

---
Deploy: 2026-10-20T20:52:12
Version: 0.2.78
Head: 77077c2
Changes:
- 2026-10-20 77077c2 Fixed volume profile: no border, only bars/label/edges hit
- 2026-10-20 b81bd7c Release v0.2.77

---
Deploy: 2026-10-20T21:21:12
Version: 0.2.79
Head: cfec293
Changes:
- 2026-10-20 cfec293 Parity log: live 1D/1W/1M candle seeded from closed hours/days
- 2026-10-20 a856899 Parity log: volume overlay and news markers
- 2026-10-20 53da35a Persist showVolume/showNews chart settings across reloads
- 2026-10-20 c7f75d9 Chart: News overlay (ForexFactory calendar markers on candles, like WPF) with settings toggle
- 2026-10-20 f6e18aa Chart: TradingView volume overlay (Vol · <asset>) with settings toggle
- 2026-10-20 20bf36e Release v0.2.78

---
Deploy: 2026-10-20T21:25:50
Version: 0.2.80
Head: 8f7905e
Changes:
- 2026-10-20 8f7905e Chart: reload current selection when the app is reopened (visibilitychange/pageshow)
- 2026-10-20 2983824 Release v0.2.79

---
Deploy: 2026-10-20T21:30:12
Version: 0.2.81
Head: 63f8ec0
Changes:
- 2026-10-20 63f8ec0 Chart: draw pen stroke live on its own pane
- 2026-10-20 f2cdbbb Release v0.2.80

---
Deploy: 2026-10-20T21:35:04
Version: 0.2.82
Head: 76dc0c5
Changes:
- 2026-10-20 76dc0c5 Chart: update fixed range profile tests for hidden idle box
- 2026-10-20 4df0494 Chart: temporarily hide idle fixed range box fill
- 2026-10-20 dee838a Release v0.2.81

---
Deploy: 2026-10-20T21:37:30
Version: 0.2.83
Head: 174e1ce
Changes:
- 2026-10-20 174e1ce Chart: no bottom padding above the MCB pane on phones
- 2026-10-20 15eeaf2 Release v0.2.82

---
Deploy: 2026-10-20T21:42:58
Version: 0.2.84
Head: da98683
Changes:
- 2026-10-20 da98683 Footer: active route as allow-listed signal (lint)
- 2026-10-20 b54a831 Revert accidental commit of mcb-localtest apiUrl
- 2026-10-20 8712c27 Release v0.2.83
- 2026-10-20 6dce010 Footer (mobile): compact line icons, bold accent active item with indicator
- 2026-10-20 7a02a94 Release v0.2.83

---
Deploy: 2026-10-20T21:49:37
Version: 0.2.85
Head: 1e0d8a3
Changes:
- 2026-10-20 1e0d8a3 Chart: render MCB pane drawings, vertical lines span both panes
- 2026-10-20 aac0c0b MCB trendlines: thicker, opaque lines and dark red for bearish
- 2026-10-20 421ea5b MCB trendlines: bullish green, bearish red (swap regime colours)
- 2026-10-20 aeab6a4 Release v0.2.84

---
Deploy: 2026-10-20T21:58:19
Version: 0.2.87
Head: 58e7de0
Changes:
- 2026-10-20 58e7de0 Chart: live price badge stays on the price axis (no overlap into plot on iPhone)
- 2026-10-20 bbf3761 Release v0.2.85

---
Deploy: 2026-10-20T22:08:02+02:00
Version: 0.2.88
Head: f4777db
Changes:
- 2026-10-20 f4777db Dashboard: device-local release time in What's new, new Tests tab with test counts per component
- 2026-10-20 55209e8 Chart: remove fixed range volume profile name label
- 2026-10-20 8e298bd Parity log: price badge fix shipped in v0.2.87
- 2026-10-20 0762a2c Release v0.2.87

---
Deploy: 2026-10-20T22:30:26+02:00
Version: 0.2.89
Head: f7bf606
Changes:
- 2026-10-20 f7bf606 Test counts as deployed in v0.2.88
- 2026-10-20 beeaaca Release v0.2.88

---
Deploy: 2026-10-21T19:15:07+02:00
Version: 0.2.90
Head: e705e97
Changes:
- 2026-10-21 e705e97 Chart: pointer on empty chart drops a selected position; empty MCB pane press clears the page selection
- 2026-10-20 f9f81e3 Release v0.2.89

---
Deploy: 2026-10-21T19:18:26+02:00
Version: 0.2.91
Head: f3ae27a
Changes:
- 2026-10-21 f3ae27a Chart: pin capital flow signals to the candle at a fixed pixel gap and stack several per side
- 2026-10-21 fac1f5f Release v0.2.90

---
Deploy: 2026-10-21T19:21:49+02:00
Version: 0.2.92
Head: 305acff
Changes:
- 2026-10-21 305acff Chart toolbar: selects shrink with ellipsis on phones, status pill dots only
- 2026-10-21 628b782 Release v0.2.91

---
Deploy: 2026-10-21T19:32:14+02:00
Version: 0.2.93
Head: 7febf86
Changes:
- 2026-10-21 7febf86 Dashboard: load calendar events without the failing date filter, read ForexFactory impact classes
- 2026-10-21 2ba2926 Release v0.2.92

---
Deploy: 2026-10-21T20:05:22+02:00
Version: 0.2.94
Head: 25ea290
Changes:
- 2026-10-21 25ea290 Chart: drawings no longer wiped by /chart or saved under the wrong symbol
- 2026-10-21 05765fa Release v0.2.93

---
Deploy: 2026-10-21T20:14:08+02:00
Version: 0.2.95
Head: a943cae
Changes:
- 2026-10-21 a943cae App icon: full-bleed square iOS/Android icons from original tile design
- 2026-10-21 e205883 Dashboard report: Issues-only GitHub token in sessionStorage, no screenshot uploads
- 2026-10-21 bbc09c0 Release v0.2.94

---
Deploy: 2026-10-21T20:22:03+02:00
Version: 0.2.96
Head: 7dc10d6
Changes:
- 2026-10-21 7dc10d6 iOS: solid fixed strip under the status bar to stop the iOS 26 top-edge blur
- 2026-10-21 6237790 Release v0.2.95

---
Deploy: 2026-10-21T20:23:58+02:00
Version: 0.2.97
Head: 793186b
Changes:
- 2026-10-21 793186b Audit: MyTradingBox code audit 2026-10-21 (W43)
- 2026-10-21 741e71b Release v0.2.96

---
Deploy: 2026-10-21T20:25:21+02:00
Version: 0.2.98
Head: 1fb0b6f
Changes:
- 2026-10-21 1fb0b6f Magnet snaps the vertical line to the nearest candle time
- 2026-10-21 ba83083 Release v0.2.97

---
Deploy: 2026-10-21T20:30:53+02:00
Version: 0.2.99
Head: f017ac4
Changes:
- 2026-10-21 f017ac4 Fix BUG-0011: gate admin-only calls on /overview
- 2026-10-21 7c83139 Release v0.2.98

---
Deploy: 2026-10-21T20:32:17+02:00
Version: 0.2.100
Head: 5847af8
Changes:
- 2026-10-21 5847af8 Keep chart labels and icons drawn while panning
- 2026-10-21 7852d01 Release v0.2.99

---
Deploy: 2026-10-21T20:45:08+02:00
Version: 0.2.101
Head: afa9709
Changes:
- 2026-10-21 afa9709 Copy price from the price axis (long-press / right-click menu)
- 2026-10-21 dc3d746 Release v0.2.100

---
Deploy: 2026-10-21T20:51:56+02:00
Version: 0.2.102
Head: c423875
Changes:
- 2026-10-21 c423875 Box strength label top-left inside the box, no plate
- 2026-10-21 e5ca17c Release v0.2.101

---
Deploy: 2026-10-21T20:55:43+02:00
Version: 0.2.103
Head: 9d660f7
Changes:
- 2026-10-21 9d660f7 Boxes run through to the left edge of the chart
- 2026-10-21 9ef7fa5 Release v0.2.102

---
Deploy: 2026-10-21T20:58:01+02:00
Version: 0.2.104
Head: 93aa26b
Changes:
- 2026-10-21 93aa26b iOS: status-bar strip reaches past the inset and is hit-testable so WebKit drops the top-edge blur
- 2026-10-21 c3a4ea0 Release v0.2.103

---
Deploy: 2026-10-21T21:09:39+02:00
Version: 0.2.105
Head: 85931fa
Changes:
- 2026-10-21 85931fa Edit bar for the selected drawing: colour, width, line style, text, fib levels, lock, delete
- 2026-10-21 cc8000c Release v0.2.104
LAST_DEPLOY_COMMIT=85931fa5709b9b7bb2d92aacde47330aa68eee92
