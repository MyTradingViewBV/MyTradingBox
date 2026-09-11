# Main Chart

## Purpose

The main Chart page is the primary market-analysis surface. It loads candles for an exchange, symbol, and timeframe, then combines price data with supported overlays, boxes, indicators, drawings, and live price updates.

## Routes and Access

- `/chart`
- `/chart/:symbol`
- `/chart/:symbol/:timeframe`
- Required access: authenticated user
- `symbol` and `timeframe` route parameters are optional depending on the route; the application supplies the current/default context when omitted.

## Available Functions

- Select an exchange and market symbol.
- Select a timeframe, including application-supported custom intervals.
- View candlestick price data and current price information.
- Toggle supported indicators, Market Cipher features, divergences, and key zones.
- View chart boxes and related market annotations.
- Use drawing tools where enabled.
- Navigate to symbol information, orders, watchlist, or alert settings where the current role permits it.
- Use fullscreen and chart interaction controls supported by the current device.
- Receive live candle/price updates from the market-data stream or polling path.
- See a small L-shaped guide from the latest candle close to the right price axis and down to its timestamp on the bottom axis.

## Typical Workflow

1. Open Chart from the footer or a symbol link.
2. Choose the exchange, symbol, and timeframe.
3. Wait for historical candles to load.
4. Enable only the overlays needed for analysis.
5. Use the chart controls to inspect price movement and navigate to related pages.

## States and Exceptions

- **Loading:** Historical candles, symbol metadata, boxes, and overlays can load independently.
- **Empty:** A symbol or timeframe may have no available candle data.
- **Live-data interruption:** The chart can stop receiving updates while the market-data service or network is unavailable.
- **Invalid route context:** Unsupported symbols or timeframes may fail to load or fall back to the current context.
- **Overlay failure:** A failed indicator, box, or key-zone request should not be interpreted as a failed account or order state.
- **Persisted drawings/layout:** Saved chart state can be unavailable, stale, or specific to the selected context.
- **Guide visibility:** The latest-candle guide is hidden until candle data and chart scales are ready, and it is hidden when the latest candle is outside the visible chart range.

## Roles and Limitations

All authenticated users can access the main chart. The main chart documentation does not promise direct buy/sell order placement; use the controls actually shown in the deployed build. Experimental chart routes have separate access and behavior; see [Chart Variants](CHART_VARIANTS.md).

## Implementation References

- `src/app/components/chart/`
- `src/app/modules/shared/services/http/chart.service.ts`
- `src/app/modules/shared/services/services/`

Verification date: 2026-09-11.
