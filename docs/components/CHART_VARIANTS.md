# Chart Variants

## Purpose

MyTradingBox has two chart pages. Both are built on the same base class and share market concepts, but they differ in how many controls they offer.

## Comparison

| Route | Audience/access | Main distinction |
|---|---|---|
| `/mcb-chart` (+ `/:symbol`, `/:symbol/:timeframe`) | Authenticated users | **Default chart.** All options: overlays, indicators, key zones, orders, drawings, settings panel, and the Market Cipher B oscillator panel below the chart. |
| `/chart` (+ `/:symbol`, `/:symbol/:timeframe`) | Authenticated users | **Simple chart.** Exchange/symbol/timeframe selectors, boxes (with a "ready boxes" toggle) and, for administrators, a divergences toggle. Uses fixed defaults and never reads or overwrites the `/mcb-chart` selections on this device. |

All in-app links to a chart (footer, watchlist, orders, coin info, admin, push notifications) open `/mcb-chart`. The retired routes `/market-cipher-b-chart`, `/web-chart` and `/tv-chart` redirect to `/mcb-chart`; `/chart-v3` redirects to `/chart`.

## Shared Implementation

Both pages extend `ChartBaseComponent` (`src/app/components/chart/chart-base.component.ts`). Route differences are protected flags and hooks on that class: `/mcb-chart` renders its oscillator panel below the chart through the `auxPanel` hook; `/chart` sets `usesDeviceChartSettings = false`, defaults a first visit to Bybit and forces its simple overlay set. Both stream live candles for every supported exchange through `ExchangeStreamFactory`; dominance symbols use REST polling. `/mcb-chart` uses `chart-base.component.html`; `/chart` has its own `chart-component.html`.

They share one `TimeScale` (`src/app/components/chart/scales/time-scale.ts`) and one interaction state machine (`ChartInteractionService`): zoom, pan, axis resets, crosshair and realtime-follow behave identically. See [Chart Interactions](CHART_INTERACTIONS.md) and [Coordinate System](../COORDINATE_SYSTEM.md).

## Troubleshooting

1. If no symbol is selected or the symbol is blank, the chart displays an empty candle state and does not send an invalid candle request. Select a valid symbol before loading market data.
2. Confirm the route and symbol are valid.
3. Check the selected exchange and timeframe.
4. Retry after market-data or network interruptions.
5. Use `/mcb-chart` when the simple chart does not provide the expected control.

## Implementation References

- `src/app/components/chart/` (base class, simple `/chart` page)
- `src/app/components/market-cipher-b-chart/` (`/mcb-chart`)

Verification date: 2026-10-07.
