# Watchlist

## Purpose

Watchlist monitors configured symbols across the selected exchange context. It combines symbol management with ticker, profile, box, and signal information where those services return data.

## Route and Access

- Route: `/watchlist`
- Required access: authenticated administrator in the current route configuration
- Add-symbol workflow: [Add Symbol](ADD_SYMBOL.md)

## Available Functions

- View the configured symbol collection.
- Search or sort the displayed symbols.
- View current ticker values, percentage changes, and available market details.
- Display supported boxes, signal bars, and profile information.
- Show a flow forecast per coin: a wave with the last 24 hours of 1h closes, the live price, and a projected path for the next 6 hours with an uncertainty cone. The nearest support and resistance boxes are drawn as bands behind the wave.
- Show a market-flow summary (coins trending up, trending down, at a turning point) and sort by flow score (the sort button cycles % ▼, % ▲, Flow, off).
- Open Coin Information or Chart for a symbol.
- Remove a symbol, including the page's touch/swipe action where available.
- Open alert configuration where the current role permits it.
- Add symbols through the dedicated Add Symbol page.

## Typical Workflow

1. Open Watchlist.
2. Select or search for a symbol.
3. Review the current ticker and signal information.
4. Open Coin Information or Chart for analysis.
5. Add or remove symbols through the watchlist controls.

## States and Exceptions

- **Loading:** Symbols and live ticker/box/signal data can arrive at different times.
- **Empty:** A new account, exchange, or filter may produce no symbols. If the session has no user ID, the profile request is not sent and the list is empty; it never falls back to another user's watchlist.
- **Ticker failure:** A symbol can remain visible while its current price is unavailable.
- **Partial data:** Profile, boxes, signals, and ticker values are separate dependencies.
- **Remove failure:** A failed persistence request means the server-side watchlist may be unchanged.
- **Exchange context:** The same symbol can have different data or availability on another exchange.

## Flow Forecast

The forecast is a heuristic based on the data. It is not advice. Per coin the page fetches 40×12m, 48×1h and 40×4h candles from the coin's own exchange, cached for 3 minutes. The capital-flow signals that are already in the 30-second profile refresh are combined with them.

- **Per timeframe score (12M, 1H, 4H):** 50% EMA(8) slope over 3 bars in ATRs, 30% direction of the last 3 candles, 20% EMA(8) above or below EMA(21). The chip under the wave shows those last 3 candles.
- **Capital-flow signals (1h, 4h, 1d, 1w):** bullish +, bearish −, weighted by tier (bronze 0.4 … diamond 1) and faded by `BarsAgo` (ignored after 5 bars).
- **Lower momentum:** 12m + 1h candles + 1h signal. **Higher bias:** 4h candles + 4h/1d/1w signals. **Score:** 60% lower + 40% higher, so the lower frames lead.
- **States:** *Trend omhoog / omlaag* when the score is above +0.2 or below −0.2. *Collapse-risico* when the higher frames are up (above 0.2) but the lower frames turn down clearly (below −0.3). *Omkeer omhoog* is the opposite case. Otherwise *Zijwaarts*. Confidence is the share of timeframes that agree with the direction, scaled by its strength.
- **Projection:** a drift of 0.6 × ATR(1h) × score per hour, slowing with √h. At a turning point the drift follows the lower momentum. The first box in the path stops the move (shown as *Afwijzing bij box*), unless the flow is strong and aligned (|score| > 0.55): then it breaks into the box, capped at its far edge (shown as *Doorbraak box*).
- **Boxes:** the same selection as the earlier level bar, the 2 nearest boxes below price and the 2 nearest above. A box that is far outside the wave range is shown as an arrow with its distance in % at the top or bottom edge.

Logic: `src/app/components/watchlist/flow/flow-forecast.ts` (pure, unit tested). Rendering: `watchlist-flow.component`.

## Roles and Limitations

Although the page is conceptually a watchlist, the active route requires `authGuard` and `adminGuard`. Non-admin authenticated users are redirected to `/dashboard`. Watchlist visibility is not proof that an order can be placed for the symbol.

## Implementation References

- `src/app/components/watchlist/`
- `UserSymbolsService`
- `UserNotificationSettingsService`
- `ExchangeTickerFactoryService`
- `ChartBoxesService`

## Look and feel

Rows, chips, buttons and the empty-state call to action ("Add your first symbol", primary gradient button) use the shared `--mtb-*` tokens and mixins (`docs/STYLE_GUIDE.md`), so dark and light follow automatically. Signal tiers keep their metal colours (bronze, silver, gold, platinum, diamond); long/short markers use `--mtb-success` / `--mtb-danger`; support/resistance box bands in the flow wave use the same two tokens. The projected path, cone and state pill take the flow colour: green for up or reversal up, red for down or collapse risk, muted for sideways.

Verification date: 2026-10-19.
