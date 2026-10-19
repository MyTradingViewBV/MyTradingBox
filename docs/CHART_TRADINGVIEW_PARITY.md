# Chart: TradingView Parity Log

Running log of the work to make the chart pages (`/chart`, `/mcb-chart`) look and feel like TradingView. Every change gets an entry: what changed, why, and where. Open items stay in the backlog until they are done or dropped.

Reference for comparisons: TradingView web, dark theme, the same symbol and timeframe (BTCUSDT 1h) with the Market Cipher B indicator.

## How to compare

1. Start the local environment (`C:\repos\mcb-localtest\start.ps1`, see [Testing](TESTING.md)) and open `http://localhost:4300/mcb-chart/BTCUSDT/1h`.
2. Open the same symbol and timeframe on TradingView next to it.
3. Compare mobile (390x844) and desktop (1440x900). After a deploy, refresh once: an open tab keeps the old build.

## Log

### v0.2.66 (2026-10-19): zones and levels toned down

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
