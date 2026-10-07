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
- Use fullscreen and chart interaction controls supported by the current device: pointer-anchored wheel and trackpad-pinch zoom, two-finger pinch, drag-to-scale on the time and price axes, drag to pan (limited to the loaded candles), double click / double tap on an axis to reset it. Details: [Chart Interactions](CHART_INTERACTIONS.md).
- Receive live candle/price updates from the market-data stream or polling path. While the view follows the latest candle, new candles shift it by the same number of bars; after panning away the view stays put and a "Return to live" button appears at the bottom-right of the plot.
- View one synchronized crosshair across the price chart and, on the Market Cipher B route, its oscillator panel.
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
- **Settings-panel selections:** Overlay, indicator, tier, key-zone and box-mode choices are stored on the device (not per symbol or account) and used by `/mcb-chart`. "Clear storage" in Settings resets them; the simple `/chart` keeps its own fixed defaults.
- **Detached from live:** After panning away from the latest candle, new candles do not move the view until "Return to live" is used or the view is panned back. Double click on the plot does not jump to the latest candle; it only toggles fullscreen.
- **Guide visibility:** The latest-candle guide is hidden until candle data and chart scales are ready, and it is hidden when the latest candle is outside the visible chart range.

## Roles and Limitations

All authenticated users can access the main chart. The main chart documentation does not promise direct buy/sell order placement; use the controls actually shown in the deployed build. Experimental chart routes have separate access and behavior; see [Chart Variants](CHART_VARIANTS.md).

## Implementation References

- [Chart Interactions](CHART_INTERACTIONS.md) and [Coordinate System](../COORDINATE_SYSTEM.md)

- `src/app/components/chart/`
- `src/app/modules/shared/services/http/chart.service.ts`
- `src/app/modules/shared/services/services/`

Verification date: 2026-10-05.
