# Coin Information

## Purpose

Coin Information provides a focused view for one symbol, including market information and links into charting and alert workflows.

## Route and Access

- Route: `/coin/:symbol`
- Required access: authenticated user
- Route parameter: `symbol`

## Available Functions

- Load information for the requested symbol.
- Display CoinGecko-backed coin details when available.
- Seed or display ticker data from the market-data service.
- Navigate to the symbol's chart.
- Navigate to alert configuration where the current role and route allow it.
- Handle dominance-related symbols as a special case.

## Data and Dependencies

The page combines route data with external CoinGecko information and market ticker data. A successful page render can therefore contain partial data if one source responds while another fails.

## States and Exceptions

- **Loading:** Coin details and ticker values may arrive at different times.
- **Partial data:** Market data or metadata may be missing independently.
- **Unknown symbol:** The route can be opened with a symbol that the external service cannot resolve.
- **External/API failure:** Retry after connectivity is restored; a chart link may still depend on the symbol being supported by the chart service.
- **Special symbol:** Dominance symbols do not necessarily behave like ordinary tradeable coins.

## Roles and Navigation

All authenticated users can open coin information. The page links to Chart and, where permitted, alert settings. It does not by itself grant order-entry or administrative access.

## Implementation References

- `src/app/components/coin-info/`
- `src/app/modules/shared/services/http/`
- `src/app/modules/shared/services/services/binance-ticker.service.ts`

Verification date: 2026-09-11.
