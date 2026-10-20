# Chart: TradingView Parity Log

Running log of the work to make the chart pages (`/chart`, `/mcb-chart`) look and feel like TradingView. Every change gets an entry: what changed, why, and where. Open items stay in the backlog until they are done or dropped.

Reference for comparisons: TradingView web, dark theme, the same symbol and timeframe (BTCUSDT 1h) with the Market Cipher B indicator.

## How to compare

1. Start the local environment (`C:\repos\mcb-localtest\start.ps1`, see [Testing](TESTING.md)) and open `http://localhost:4300/mcb-chart/BTCUSDT/1h`.
2. Open the same symbol and timeframe on TradingView next to it.
3. Compare mobile (390x844) and desktop (1440x900). After a deploy, refresh once: an open tab keeps the old build.

## Log

### v0.2.79 (2026-10-20): Volume overlay and News markers

Feedback (Erwin): add TradingView's "Vol · BTC" volume indicator (with an on/off toggle) and show the News table in the app the way WPF does.

| Change | Why | Where |
| --- | --- | --- |
| Volume overlay on the price pane: one bar per candle in the bottom 20% of the plot, green/red after the candle's direction at 50% opacity, scaled to the tallest visible bar; extra legend row "Vol · <base asset> 1.96K" for the candle under the crosshair. Settings panel toggle "Volume" (default on, stored on the device) | TradingView's built-in Volume indicator; the candles already carried Volume | `volume.plugin.ts`, `legendPlugin` in `chart-plugins.ts`, `chart-base.component.*`, `chart-settings-panel.component.html` |
| News overlay (settings toggle "Nieuws", default off): 📰 marker with a dot above every candle a ForexFactory calendar event overlaps, red for high impact, yellow otherwise; the crosshair over a marked candle shows its events (currency, name, time, actual/forecast/previous). Ported from WPF `SetNewsEventsSeries` (same time-window parsing, future events on a virtual candle after the last one, last 90 / next 30 days) | WPF parity: the data comes from the NewsBot's `forex_calendar_events` via the existing `ForexCalendarEvents` API | `news-events.ts`, `news.plugin.ts`, `chart.service.ts`, `chart-base.component.ts` |
| `showVolume` / `showNews` added to the persisted chart-settings whitelist | Without it the toggles reset on every reload | `state-persistence.meta-reducer.ts` |

Note: the API's `fromDate`/`toDate` filter returns HTTP 500 (that is why WPF has it commented out), so the app fetches all events (the table holds the current month only) and filters client-side. As in WPF, "All Day"/"Tentative" events mark every candle of that day, so lower timeframes get busy. The overlays are on `/mcb-chart`; `/chart` has no settings panel.

### v0.2.79 (2026-10-20): Live daily candle no longer restarts from the first tick

Feedback (Erwin, iPhone screenshot): on 1D in the evening the live candle was a tiny new bar (O 82,499.90 H 82,523 L 82,499.90) next to yesterday's candle instead of today's full bar.

| Change | Why | Where |
| --- | --- | --- |
| Long live buckets (1d after ~16:40 UTC, 1w, 1M, 1j) are seeded from closed 1d + 1h candles plus the 1m candles since the last closed hour, each tier continuing gap-free from the bucket start; the target-timeframe candle stays the last fallback | The backend serves closed candles only, so the old seed (the target timeframe's own in-progress candle) never existed: the stream aggregator started the bar at the first websocket tick, giving a wrong open/high/low for the rest of the bucket | `seedFromClosedTiers` in `exchange-candle-stream.service.ts` (+ spec) |

### v0.2.78 (2026-10-20): Fixed Range Volume Profile no longer blocks the chart

| Change | Why | Where |
| --- | --- | --- |
| The profile's range box has no border any more (fill only; hover/selection tints the fill blue) | TradingView draws the range without a frame | `fixed-volume-profile.plugin.ts` |
| Only the histogram bars, the name label and the left/right edges select or move a profile; the empty rest of the range passes clicks and panning through. A chart-wide profile kept reopening its panel on every click | TradingView selects a profile by its histogram, not by the empty range | `hitTest` in `fixed-volume-profile-layer.service.ts` |

### v0.2.75 (2026-10-20): cursor tool, axis scaling while drawing, Fixed Range Volume Profile

Feedback (Erwin): while drawing a fibonacci the pivot can lie off-screen but the axes could not be scaled; after drawing a line the tool seemed to stay active (TradingView has a default cursor option); and a fixed volume profile should be drawable like in the WPF app, saved through the API.

| Change | Why | Where |
| --- | --- | --- |
| Cursor button at the top of the drawing toolbox, selected whenever no tool is active; every tool except the pen (which keeps stroking on purpose) returns to it after placing | TradingView shows an explicit default-cursor option, so you can see you are out of drawing mode and never add elements by accident | `drawing-toolbox.component.ts` |
| While a drawing tool is active (e.g. fib with one point placed), a mouse press on the price/time axis scales that axis, a one-finger touch on an axis scales it, and a two-finger pinch zooms — pending points survive; during touch gestures the preview keeps its data position, during a mouse axis drag it follows the pointer; wheel zoom already worked | TradingView lets you scale/pan mid-drawing to reach an off-screen pivot | `onMouseDown`/`onTouchStart` routing + `routeToolTouchStart` in `chart-base.component.ts` |
| New "Fixed Volume Profile" tool (toolbox section Volume): two clicks select a time range, a config panel (naam, timeframe, naar rechts doorlopen) saves it via the FixedVolumeProfiles API; saved profiles render as a range box with a client-side histogram (100 rows, 70% value area, the bot's algorithm) plus POC (solid) and VAH/VAL (dashed) lines; select to edit, drag the body to move, drag an edge to resize (PUT), delete with a two-step button | TradingView's Fixed Range Volume Profile; the backend (API CRUD + FixedVolumeProfileBot that stores POC/VAH/VAL every minute) already existed, only the chart tool was missing | `fixed-volume-profile.ts` (utility), `fixed-volume-profile-layer.service.ts`, `fixed-volume-profile.plugin.ts`, `drawing-tools.service.ts`, `chart-base.component.*`, `chart.service.ts` |
| ExtendRight computes over the range extended to the latest candle, matching the bot; profile hit-boxes are clipped to the plot so axis presses never grab a profile; one selection at a time across drawings and profiles (Delete can no longer remove an invisible selection); locked drawings stay selectable above a profile | Parity and safety fixes from the task audit | `fixed-volume-profile.plugin.ts`, `chart-base.component.ts` |

Note: `/chart` has no drawing toolbox, so the profile tool lives on `/mcb-chart` only. Profiles are global per exchange/symbol (shared with the bot and WPF), not per user. The chart's histogram uses the candles of the timeframe you are viewing; the bot stores its levels from the profile's own Timeframe, so the lines can differ slightly between the two.

### v0.2.74 (2026-10-20): watermark back in the centre, symbol icon in the legend, tighter price axis

Feedback (Erwin): the watermark had moved, the symbol logo top-left was gone, and the price axis was suddenly very wide.

| Change | Why | Where |
| --- | --- | --- |
| Logo watermark back in the centre of the plot (max 35% of the plot, alpha 0.15); reverts the v0.2.64 bottom-left corner logo | The centred watermark is part of the app's look; the corner logo read as a regression | `watermarkRect` in `chart-plugins.ts` |
| Symbol icon (18px, clipped round) drawn before the legend title "BTCUSDT · 1H · Binance" | The v0.2.63 canvas legend replaced the old title pill but dropped its coin icon; TradingView shows the icon in the legend | `legendPlugin` / `legendIconImage` in `chart-plugins.ts`, `data-legend-icon` on the canvas in both chart templates |
| Price-axis column tight around the labels: tick padding 8 → 4, layout padding right 10 → 3 (~82px → ~71px for "82,551.00") | TradingView fits the same label in ~65px; the dead space left and right of the labels made the axis look very wide | y `ticks.padding` and `layout.padding` in `chart-base.component.ts` |

### v0.2.70 (2026-10-19): long/short position tool placed and constrained like TradingView

Feedback (Stefan): "positions zetten long en short werkt heel anders dan tradingview".

| Change | Why | Where |
| --- | --- | --- |
| One click places the whole position: entry at the click, TP at 20% and SL at 10% of the visible price range (R:R 2), right edge 25% of the visible time range further; adjust by dragging the handles (was: 3 separate clicks for entry, TP and SL, nothing visible until the third) | TradingView places the tool with a single click and you adjust afterwards | `addPoint` / `buildPositionPoints` in `drawing-tools.service.ts` |
| The tool side is authoritative: a long-position always renders and labels as Long with TP above entry and SL below, a short mirrored (was: the side was inferred from where the TP was clicked, so the Short tool could produce a Long) | TradingView's Long and Short tools are distinct; the side never flips by accident | `drawPosition` in `drawing-tools.plugin.ts` |
| Dragging clamps at the entry: TP and SL cannot cross to the wrong side, the entry stays between SL and TP (was: no validation; TP and SL could sit on the same side of the entry) | TradingView clamps the handles the same way | `applyPositionResize` in `chart-base.component.ts`, `positionMinGap` in `drawing-tools.service.ts` |
| The editor's flip button now also switches the drawing between long and short on apply | Flipping the prices without the type produced a "Long" with TP below entry | `flipPosition` / `applyPositionEdit` in `chart-base.component.ts` |
| Price-axis badges say `Target` and `Stop` (were `High` / `Low`) | TradingView's wording for the position tool levels | badge rendering in `drawing-tools.plugin.ts` |

Note: positions drawn before this release with a "crossed" side (e.g. Short tool with TP above entry) now label by their tool; the first drag or edit snaps TP/SL to the correct side. Still open for full parity: quantity/risk amounts from an account size setting.

The chart looked busy because every zone, level and marker was drawn at full strength. Candles now stay the brightest thing on the chart; colours and meaning are unchanged.

| Change | Why | Where |
| --- | --- | --- |
| Trade/ready boxes: TradingView green `rgba(8,153,129)` / red `rgba(242,54,69)` fill at 0.16 (was neon green 0.35 / pure red 0.55, cyan 0.28), thin 1px border at 0.55 (was no border); colour-coded and grey boxes 0.14 / 0.12 | Overlapping boxes added up to solid colour | `resolveBoxColors`, `buildBoxDatasets` in `chart-utils.ts`; `boxPainterPlugin` |
| Box strength label (`S: 89`): 10px text in the zone colour on a faint plate (was white text with glow, black plate, white outline and a colour icon) | Labels on the left edge shouted louder than the zones | `minMaxLabelPlugin` in `chart-plugins.ts` |
| Capital-flow markers ("Ba", "Ba+d"): candle colours at 0.85 (was `#00C853` / `#D50000`), 1px smaller, no shadow | Text over the candles competed with them | `buildCapitalFlowDatasets` in `chart-indicators.service.ts`, `indicatorLabelPlugin` |
| Key-zone lines translucent: levels 0.75 (tested 0.4), nPOC 0.75 and 1px (was 1.5px opaque), value area 0.7, POC 0.85 and 1.5px (was 2px opaque). Labels on the line and price-axis tags stay opaque | Many levels drowned the candles; the labels still need to be readable | `buildKeyZoneItems` in `key-zone-layers.ts` |
| Order blocks and liquidity zones: fill 0.1 (was 0.14 / 0.16), border 0.45 (was 0.55 / 0.6) | Same | `buildKeyZoneItems` |
| Spec that keeps zones and levels subtle | So a later change can't bring the neon back by accident | `chart-tone.spec.ts` |

Not checked visually: the local test database has no zones, boxes or capital-flow signals. Check on the live app.

### v0.2.65 (2026-10-19): scale, logo, MCB pane

| Change | Why | Where |
| --- | --- | --- |
| Price axis: at least 40px between labels (was 30) | The scale looked crowded; TradingView spaces labels about 40px apart | `PRICE_TICK_MIN_GAP_PX` in `chart-base.component.ts` |
| Thousands separators in the price axis, the legend and the crosshair price label (`82,600.00`) | TradingView shows separators everywhere | `formatPriceText` / `priceLabelDecimals` in `chart-plugins.ts` |
| Logo watermark: 32px tall in the bottom-left corner, alpha 0.18 (was 35% of the plot in the centre, alpha 0.15) | The big centred logo was the first thing you saw; TradingView keeps a small logo in a corner | `watermarkRect` in `chart-plugins.ts` |
| MCB pane auto scale: fits the visible data (always including 0, widened to ±60 when the data comes within 15 of those levels, 8% padding) instead of a fixed -110..110. A manual range (axis drag) still wins; double-click the axis or "A" returns to auto | With the fixed range the waves used about a third of the pane and looked flat | `fitMcbYRange` in `mcb-panel.component.ts` |
| MCB pane height: 30% of the chart area (min 170px, 150px on phones) instead of a fixed 190/170px. A dragged height still overrides it | TradingView gives an indicator pane about a third of the chart | `mcb-panel.component.scss` |

### v0.2.64 (2026-10-19): first pass

| Change | Why | Where |
| --- | --- | --- |
| Legend in the top-left of the price pane: `BTCUSDT · 1H · Binance` and O/H/L/C plus change of the candle under the crosshair (latest candle otherwise). Replaces the centred title pill | TradingView's signature legend; the pill covered the candles | `legendPlugin` in `chart-plugins.ts`, title via the canvas attribute `data-legend-title` |
| Last-price label filled in the current candle colour, countdown under it; dotted price line across the pane in the same colour | TradingView last-price label (was a yellow-outlined box and a grey dashed line) | `.current-price-badge` in `chart-base.toolbar.scss`, `latestCandleGuidePlugin` |
| Candle colours `#089981` / `#F23645` | TradingView's current colours (were `#26a69a` / `#ef5350`) | `CANDLE_UP_COLOR` / `CANDLE_DOWN_COLOR` in `chart-plugins.ts` |
| MCB pane flush under the price pane: same background, no card, 1px separator with a larger drag area; legend with the current values in their line colours (too-dark colours lightened) | TradingView panes form one chart surface | `mcb-panel.component.scss`, `readableLegendColor` |
| 8 empty bars right of the latest candle (was 3). While following the live edge, a time-axis zoom anchors on the right edge, so the empty bars stay and the view keeps following | TradingView keeps a gap after the latest candle and never detaches on zoom | `RIGHT_PADDING_BARS`, `beginTimeAxisScale` in `chart-interaction.service.ts` |
| Axis labels 11px | Quieter scales | chart options, `mcb-panel.component.scss` |
| Simple chart toolbar: selects no longer overlap; the controls scroll sideways on a phone | Bug found while comparing | `chart-component.scss` |

## Backlog

From the comparison of 2026-10-19 (app vs TradingView, BTCUSDT 1h), biggest effect first.

| Item | Size | Notes |
| --- | --- | --- |
| Level labels on the price axis must not cover the tick values | Small/medium | TradingView never hides a tick behind a level tag |
| Volume bars at the bottom of the price pane (semi-transparent, candle colours) | Medium | Candles already carry `v` |
| Crosshair labels on both axes in TradingView style (dark grey boxes, price with separators) | Medium | Price label already uses separators since v0.2.65 |
| Smaller labels for zones and drawings, placed inside the box at the right edge | Medium | |
| Check the empty space on the right after zooming out (time axis ran to 22 Oct while candles ended 19-20 Oct in the comparison screenshot) | Small | May be a user zoom/scroll; verify on the current build |
| Switch to Lightweight Charts (TradingView's library) | Large | TradingView scrolling, zooming, crosshair and panes; means rewriting both charts (zones, drawings, MCB pane, trendlines). Own branch, several sessions |
