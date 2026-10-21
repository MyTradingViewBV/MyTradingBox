# Chart: TradingView Parity Log

Running log of the work to make the chart pages (`/chart`, `/mcb-chart`) look and feel like TradingView. Every change gets an entry: what changed, why, and where. Open items stay in the backlog until they are done or dropped.

Reference for comparisons: TradingView web, dark theme, the same symbol and timeframe (BTCUSDT 1h) with the Market Cipher B indicator.

## How to compare

1. Start the local environment (`C:\repos\mcb-localtest\start.ps1`, see [Testing](TESTING.md)) and open `http://localhost:4300/mcb-chart/BTCUSDT/1h`.
2. Open the same symbol and timeframe on TradingView next to it.
3. Compare mobile (390x844) and desktop (1440x900). After a deploy, refresh once: an open tab keeps the old build.

## Log

### v0.2.108 (2026-10-21): Line text "on the line" breaks the line

Feedback (Erwin): text in the middle of a line was crossed by the line; the text must always be readable.

| Change | Why | Where |
| --- | --- | --- |
| With the text position "on the line", the line stroke is cut away behind the text (text width plus 4px each side, rotated along the line), so the line stops on both sides of the text. Works for horizontal, vertical and trend lines | TradingView breaks the line around middle text; the stroke ran straight through the letters | `clipLineTextGap` / `lineTextSegment` in `drawing-tools.plugin.ts` |

### v0.2.107 (2026-10-21): Box prices on the price axis, fixed volume profiles toggle

Feedback (Erwin): the fixed volume profile drawing could not be filtered out like an indicator, and the box min/max prices were not visible on the y-axis.

| Change | Why | Where |
| --- | --- | --- |
| Every trade box in the visible time range shows its top and bottom price as a tag in the price-axis column, in the box colour. A tag that would overlap one already on the axis (key-zone levels, another box) is skipped. The tags are in the "Copy price" menu as "Box top" / "Box bottom" | TradingView shows a rectangle's prices on the axis; the box edges could only be read from the grid | `boxAxisTagPlugin` in `chart-plugins.ts` |
| Settings panel, Indicators: "Fixed range volume profiles" switch. Off hides every saved profile (not drawn, no hover or drag, selection and edit panel closed); stored on this device like the other switches | Every other overlay could be switched off, the profiles could only be deleted | `visible` in `fixed-volume-profile-layer.service.ts`, `fixed-volume-profile.plugin.ts`, `showFixedVolumeProfiles` / `onToggleFixedVolumeProfiles` in `chart-base.component.ts`, `chart-settings-panel.component.html`, `state-persistence.meta-reducer.ts` |

### v0.2.106 (2026-10-21): Box strength label stays inside thin boxes

Feedback (Erwin): on a thin box the label fell out of the bottom of the box; hide it when the box gets too small, or centre it instead of pushing it down.

| Change | Why | Where |
| --- | --- | --- |
| The label is placed by the visible height of the box: top-left corner when the text fits with 4px padding, vertically centred on the left edge when only the text fits, hidden when the box is thinner than the text. A box cut off at the top of the pane uses the visible part | The top-left anchor drew 10px text below the bottom edge of thin boxes, and stacked thin boxes produced overlapping labels | `minMaxLabelPlugin` in `chart-plugins.ts` |

### v0.2.105 (2026-10-21): Edit bar for the selected drawing

Feedback (Erwin): when a line, pen or fib is selected, show a TradingView-style bar on the chart to change the thickness, add text and align it, change the colour, lock and delete; on a fib retracement, add your own levels and give them other colours.

| Change | Why | Where |
| --- | --- | --- |
| A floating edit bar appears at the top of the chart while a drawing is selected (hidden while a drawing tool is active). It has colour (12 swatches plus a custom colour), text (text field, left/centre/right, above/on/below the line or top/middle/bottom in a rectangle, size 10–24), line width 1–4px, line style (solid/dashed/dotted), fib levels, lock and delete. The grip on the left drags the bar out of the way. Lines, pen and rectangle get all options; fibs get colour, width, style and levels; positions, ruler and zones only lock and delete | TradingView shows the same floating bar on a selected drawing; until now lock and delete only existed in the drawing toolbox | `drawing-edit-toolbar.component.ts`, `chart-base.component.html`, `updateDrawing` in `drawing-tools.service.ts` |
| Fib levels can be added (any ratio, e.g. 0.705), removed, recoloured one by one and reset to the defaults | TradingView's fib settings let you add levels and pick a colour per level | `fibLevelColors` on `Drawing`, `fibLevelColor` in `drawing-tools.plugin.ts` |
| The renderer draws the new fields: dash patterns scaled to the line width, text rotated along the line (never upside down), the rectangle border uses the drawing's width, fib level lines use the chosen width and style. The new fields are optional, so older saved drawings look the same (except rectangles: 1px border instead of 1.5px) | Needed for the edit bar. Drawings are stored as a JSON blob, so the API needed no change | `lineDash`, `drawDrawingText`, `drawBox`, `drawFibRetracement` / `drawFibExtension` in `drawing-tools.plugin.ts` |

### v0.2.103 (2026-10-21): Boxes run through to the left edge

Feedback (Erwin): on the far left the box stopped; a box works like a horizontal line, endless from left to right.

| Change | Why | Where |
| --- | --- | --- |
| Trade boxes start at the left end of the overscroll range instead of at the first candle, so they also fill the empty area left of the oldest candle (the right side already used the overscroll end) | A TradingView zone is endless in both directions | `buildBoxDatasets` in `chart-utils.ts`, `__chartExtendedMin` set next to `__chartExtendedMax` in `chart-base.component.ts` |

### v0.2.102 (2026-10-21): Box strength label in the top-left corner

Feedback (Erwin): the box strength label looked odd; show it top-left inside the box, without the translucent plate.

| Change | Why | Where |
| --- | --- | --- |
| Box strength label (`S: 89`) sits in the top-left corner inside the box (was vertically centred on the left edge), plain 10px text in the zone colour, no background plate. Hidden when the box top is below the pane | The darker translucent plate stacked on the box fill looked like a separate box; TradingView puts zone text in a corner | `minMaxLabelPlugin` in `chart-plugins.ts` |

### v0.2.101 (2026-10-21): Copy price from the price axis

Feedback (Erwin): copy the price of the level labels, the pointer and long/short setups straight from the y-axis; on mobile with a long-press, on desktop with a right-click.

| Change | Why | Where |
| --- | --- | --- |
| Long-press (500 ms, finger still) on the price axis on touch, or right-click on it with a mouse, opens a "Copy price" menu: one entry per price label under the press (key-zone levels such as "1D nPOC" / "1H Fib 0.618", the crosshair label, the live price badge, horizontal lines, box edges, fib levels, Long/Short Entry, Target and Stop), nearest first, plus the price at the press ("At this level"). A tap copies the price without thousands separators (84545.75) and shows a toast. Moving the finger first stays an axis scale; a right-press on the axis no longer starts anything else | TradingView's price-axis context menu has "Copy price"; pasting levels into an exchange order form needs the exact number | `utils/axis-price-tags.ts` (labels registered while drawn, cleared every draw), `keyZonePainterPlugin` / `crosshairPlugin` (`chart-plugins.ts`), `drawYAxisLabels` (`drawing-tools.plugin.ts`), `price-axis-menu.component.ts`, `armAxisMenuPress` / `onContextMenu` / `openPriceAxisMenu` (`chart-base.component.ts`) |

### v0.2.100 (2026-10-21): Labels and icons stay visible while panning

Feedback (Erwin): some drawings, lines and icons disappeared while moving the chart and came back after letting go.

| Change | Why | Where |
| --- | --- | --- |
| The default ("balanced") performance tier no longer skips key-zone labels and axis tags, indicator glyphs, order labels, min/max labels, divergence dots and the watermark during pan/zoom. Box labels skipped during every interaction; they now follow the same setting. Only the 'low' tier (weak devices) still skips them | TradingView keeps everything on screen while you scroll; the flicker made the chart feel broken | `skipLabelsDuringInteraction` in `chart-performance.service.ts`, `getPerfProfile` fallback and `boxLabelPlugin` in `chart-plugins.ts` |

### v0.2.98 (2026-10-21): Magnet works for the vertical line

| Change | Why | Where |
| --- | --- | --- |
| With the magnet on, a vertical line snaps to the nearest candle's time when placed and when dragged, whatever the cursor's height. Before, it only snapped when the cursor was also near an O/H/L/C price, so it hardly ever did | A vertical line only has a time; TradingView's magnet puts it on the candle | `xOnly` in `snapToOhlc`, vertical-line drag in `chart-base.component.ts` |

### v0.2.94 (2026-10-21): Drawings are no longer wiped or saved under the wrong symbol

Audit findings BUG-0002 and BUG-0003 (audit 2026-10-21). Like TradingView, drawings belong to the symbol they were drawn on.

| Change | Why | Where |
| --- | --- | --- |
| `/chart` never saves drawings (`persistsDrawings = false`) | It starts with an empty drawing list, and its auto-save wrote `[]` to the symbol's chart state, wiping the drawings made on `/mcb-chart` | `chart-component.ts`, `saveDrawings` in `chart-base.component.ts` |
| A restore from the backend is no longer written back. Every edit is saved to the exchange/symbol whose drawings are on screen, captured when the edit is made, not when the 1.5 s debounce fires | Switching symbol within 1.5 s of a load saved the old symbol's drawings over the new symbol's | `ngOnInit` auto-save, `_drawingsOwner`, `loadChartStateForCurrentContext` in `chart-base.component.ts` |
| An edit pending while the exchange changes is dropped | The backend takes the exchange from the current settings, so it would land on the wrong exchange | `saveDrawings` |

### v0.2.92 (2026-10-21): Toolbar fits on phones with long symbol names

Feedback (Erwin): the selection bar at the bottom falls off the screen on mobile when the texts are long (e.g. ALTCOINDOMINANCE).

| Change | Why | Where |
| --- | --- | --- |
| The exchange and symbol selects shrink and end in "…" instead of pushing the status pill and buttons off screen; the symbol gives way first, the timeframe keeps its width, the actions never shrink | The selects took their full text width and nothing in the bar could shrink | `.chart-mini-toolbar` rules in `chart-base.toolbar.scss` |
| On phones (≤480px) the status pill shows only its dots (and the offline-bots count); the words API/Bots stay in the tooltip | Frees about 60px for the symbol; TradingView's mobile header shows icons only | `system-status.component.html/.scss` |

### v0.2.91 (2026-10-21): Capital flow signals pinned to the candle

Feedback (Erwin): the capital flow signals are not pinned to the top/bottom of the candle like the news markers; zooming out moves them further away, zooming in closer. A candle can have several signals above or below it.

| Change | Why | Where |
| --- | --- | --- |
| Capital flow labels sit at a fixed 6px under the candle low (bullish) or above the high (bearish), centred on the candle, at every zoom level. They were placed at a price offset derived from the candle ranges, so their pixel distance changed with the vertical scale | TradingView pins signal labels to the bar, a constant distance from its wick | `glyphAnchor` in `indicatorLabelPlugin` (`chart-plugins.ts`), `buildCapitalFlowDatasets` (`chart-indicators.service.ts`) |
| Several signals on one side of a candle stack outward, one line each, highest priority nearest the candle; the same glyph twice (e.g. from two exchanges) shows once. Before, only the highest-priority signal per candle was drawn | A candle can carry several capital flow signals | `glyphSlot`, `buildCapitalFlowDatasets` |
| Above a candle with a news marker, the labels start past the marker | They would draw over the news dot | `NEWS_MARKER_CLEARANCE_PX` (`news.plugin.ts`) |

### v0.2.90 (2026-10-21): Pointer on empty chart drops every selection, positions and the MCB pane included

Feedback (Erwin): after drawing e.g. a line or a long/short position, using the pointer must take the focus off it again.

| Change | Why | Where |
| --- | --- | --- |
| A mouse press on empty chart now also deselects a selected long/short position (it stayed highlighted; only touch dropped it). Lines, fibs and boxes already deselected, and every tool except the pen already returned to the cursor after placing (v0.2.75) | TradingView's pointer on empty space clears any selection | `selectLockedOrClear` / `clearDrawingSelection` (`chart-base.component.ts`) |
| A press on empty space in the MCB pane drops the selection on the whole page: drawings on either pane, a position and a fixed volume profile (was: only a drawing on the MCB pane itself) | One chart surface, one selection, as in TradingView's panes | `clearSelection` on `McbPlotHost` / `selectDrawing` (`mcb-panel.component.ts`), `clearChartSelection` (`chart-base.component.ts`), host in `market-cipher-b-chart.component.ts` |

### v0.2.88 (2026-10-20): Fixed range volume profile name label removed

Feedback (Erwin): the "Current range outer" text kept showing on the chart; it belongs to the fixed range volume profile.

| Change | Why | Where |
| --- | --- | --- |
| The fixed range volume profile no longer draws its name at the top-left of the range, and the label no longer has a hit area | With the idle box fill hidden the label floated loose on the chart, and overlapping profiles printed their names over each other; TradingView's FRVP shows no name label | `createFixedVolumeProfilePlugin` (`fixed-volume-profile.plugin.ts`), `hitTest` (`fixed-volume-profile-layer.service.ts`) |

### v0.2.87 (2026-10-20): Live price label stays on the price axis on iPhone

Feedback (Erwin): on iPhone the price label on the right ran into the chart.

| Change | Why | Where |
| --- | --- | --- |
| The live price badge (price + candle countdown) starts at the price axis (chart area right + 1, like the level labels) and fills the axis to the right edge, clipped to it, instead of being anchored 10px from the right | Anchored on the right, a price wider than the axis grew left over the candles; TradingView keeps the last-price label inside the price scale | `getCurrentPriceBadgeLeft` (`chart-base.component.ts`), `chart-base.component.html`, `chart-component.html`, `.current-price-badge` in `chart-base.toolbar.scss` |

### v0.2.85 (2026-10-20): Trend line and pen draw on the MCB pane, vertical line spans both panes

Feedback (Erwin): the trend line and pen tool must also draw in the MCB panel; the vertical line must work across the MCB and price panes.

| Change | Why | Where |
| --- | --- | --- |
| Drawings placed on the MCB pane (trend line, pen, every other tool) are rendered again. The MCB chart switches the price plugin off with `plugins.drawingTools: false`, and the MCB plugin checked that same key, so it never painted; each pane's plugin now checks its own id (`mcbDrawingTools`) | The drawings were created and saved but stayed invisible | `createDrawingToolsPlugin` (`drawing-tools.plugin.ts`) |
| A vertical line is listed on every pane, wherever it was drawn: it shows, highlights, selects and drags on both the price chart and the MCB pane. On the MCB pane it is drawn at the main chart's x for that time (the same translation as the shared crosshair), so both parts line up exactly | TradingView draws a vertical line through all panes of the chart | `paneDrawings` (`drawing-tools.service.ts`), `verticalLineX` in `createDrawingToolsPlugin`, `sharedTimeX` in `mcb-panel.component.ts` |

### v0.2.83 (2026-10-20): No gap between price pane and MCB pane on iPhone

Feedback (Erwin): on iPhone there was too much black space between the chart and the MCB panel, around the separator.

| Change | Why | Where |
| --- | --- | --- |
| On phones (≤480px) the price pane no longer keeps its 10px bottom padding while a pane below it (MCB) carries the time axis | The padding was meant for time-axis labels that the main chart hides under MCB; TradingView panes sit directly on the separator | `.chart-container.has-aux-panel` in `chart-base.panels.scss`, class set in `chart-base.component.html` |

### v0.2.82 (2026-10-20): Fixed range box fill hidden (temporary)

Feedback (Erwin): temporarily remove the transparent grey box around the fixed volume profile ranges.

| Change | Why | Where |
| --- | --- | --- |
| TEMP: the idle grey range-box fill is no longer drawn; the blue fill still shows on hover / selection / drag so a range can be found and grabbed | The grey boxes cluttered the chart; to be revisited | `createFixedVolumeProfilePlugin` (`fixed-volume-profile.plugin.ts`) |

### v0.2.81 (2026-10-20): Pen stroke draws live

Feedback (Erwin): the pen tool only showed the stroke after releasing, not while drawing.

| Change | Why | Where |
| --- | --- | --- |
| A pen stroke in progress is drawn on the pane it was started on, regardless of which pane last set the cursor. Hovering the MCB pane set the cursor pane to `mcb` and the price-chart pen never reset it, so the live stroke was skipped until it was committed | TradingView draws the brush line under the pointer as it moves | `previewHere` in `createDrawingToolsPlugin` (`drawing-tools.plugin.ts`) |

### v0.2.80 (2026-10-20): Chart refreshes itself when the app is reopened

Feedback (Erwin): after reopening the app the chart only refreshed after switching the timeframe.

| Change | Why | Where |
| --- | --- | --- |
| When the page becomes visible again after at least 5 s hidden (app backgrounded, tab switched) or is restored from the back/forward cache, the chart reloads the current selection the same way re-selecting the timeframe does: candles (incl. the missed gap), live stream, overlays, drawings | TradingView catches up on resume without user action; the suspended WebSocket left the chart stale | `onVisibilityChange` / `onPageShow` / `reloadAfterResume` in `chart-base.component.ts` |

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
