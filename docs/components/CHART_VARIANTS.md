# Chart Variants

## Purpose

MyTradingBox contains several chart surfaces. They share market concepts but are separate routes with different controls, renderers, and access rules.

## Comparison

| Route | Audience/access | Main distinction | Important limitation |
|---|---|---|---|
| `/chart` and parameterized chart routes | Authenticated users | Main chart workflow with symbol/timeframe context and application overlays | Availability depends on chart and market-data services. |
| `/tv-chart` | Authenticated users | Lightweight Charts candlestick renderer with exchange, symbol, timeframe, and live stream | Alternate renderer; behavior and controls are not identical to the main chart. |
| `/web-chart` | Authenticated administrators | Web chart surface with web-specific menu and test/fake order panel | Experimental; test orders must not be treated as live trading orders. |
| `/chart-v3` | Authenticated administrators | Simplified chart variant with boxes and reduced features | Overlays, drawings, orders, and settings are intentionally limited or disabled. |
| `/market-cipher-b-chart` | Authenticated administrators | Market Cipher B signal-focused chart and overlays | Experimental signal visualization; signals are not execution advice or guaranteed predictions. |

## Shared Concepts

Variants can use exchange, symbol, timeframe, candle, indicator, box, and live-price data. Loading, empty, and API failure states depend on the relevant chart services and the selected market context. The main chart and Web Chart-based variants also show a small L-shaped guide from the latest candle close to the right price axis and down to the matching timestamp axis when the latest candle is visible.

## Roles

All variants require authentication. `/web-chart`, `/chart-v3`, and `/market-cipher-b-chart` additionally require administrator access. Non-admin users are redirected to `/dashboard` by `adminGuard`.

## Troubleshooting

1. If no symbol is selected or the symbol is blank, Chart V3 displays an empty candle state and does not send an invalid candle request. Select a valid symbol before loading market data.
2. Confirm the route and symbol are valid.
3. Check the selected exchange and timeframe.
4. Retry after market-data or network interruptions.
5. Use the main `/chart` route when an experimental variant does not provide the expected control.

Blank or whitespace-only symbols are handled locally by the shared chart base. The API is called only after a non-empty symbol is available.

## Implementation References

- `src/app/components/chart/`
- `src/app/components/tv-chart/`
- `src/app/components/web-chart/`
- `src/app/components/chart-v3/`
- `src/app/components/market-cipher-b-chart/`

Verification date: 2026-09-11.
