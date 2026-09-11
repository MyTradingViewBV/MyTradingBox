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
- **Empty:** A new account, exchange, or filter may produce no symbols.
- **Ticker failure:** A symbol can remain visible while its current price is unavailable.
- **Partial data:** Profile, boxes, signals, and ticker values are separate dependencies.
- **Remove failure:** A failed persistence request means the server-side watchlist may be unchanged.
- **Exchange context:** The same symbol can have different data or availability on another exchange.

## Roles and Limitations

Although the page is conceptually a watchlist, the active route requires `authGuard` and `adminGuard`. Non-admin authenticated users are redirected to `/dashboard`. Watchlist visibility is not proof that an order can be placed for the symbol.

## Implementation References

- `src/app/components/watchlist/`
- `UserSymbolsService`
- `UserNotificationSettingsService`
- `ExchangeTickerFactoryService`
- `ChartBoxesService`

Verification date: 2026-09-11.
