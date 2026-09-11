# Add Symbol

## Purpose

The Add Symbol page searches available exchange symbols and adds or removes them from the watchlist. It is part of the watchlist administration workflow, not a general trading or order-entry page.

## Route and Access

- Route: `/watchlist/add`
- Required access: authenticated administrator
- Returned from: Watchlist

## Available Functions

- Search available symbols by text.
- Filter the symbol list as the search changes.
- View current ticker information when available.
- Add a symbol to the watchlist.
- Remove a symbol that is already selected.
- Return to the watchlist or open a selected symbol's related view where the UI provides that action.

## Important Symbol Rules

- BTCUSDT and dominance-related symbols receive special handling in the current implementation.
- Availability and ticker data depend on the exchange symbol service and market-data responses.

## States and Exceptions

- **Loading:** Symbols or ticker data may not be immediately available.
- **Empty:** No symbols match the search or the exchange returns no symbols.
- **Already selected:** The control reflects that the symbol is already in the watchlist.
- **Network/API failure:** Search, ticker, or save operations may fail and should be retried after connectivity is restored.
- **Invalid symbol:** The page should not be treated as proof that a market can be charted or traded until the backend accepts it.

## Roles and Navigation

Non-admin authenticated users are redirected away by `adminGuard`. The normal path is Watchlist -> Add symbol -> Watchlist or Coin/Chart views.

## Implementation References

- `src/app/components/watchlist/add-symbol/`
- `src/app/modules/shared/services/http/chart.service.ts`
- `src/app/modules/shared/services/services/user-symbols.service.ts`

Verification date: 2026-09-11.
