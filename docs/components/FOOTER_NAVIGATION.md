# Footer Navigation

## Purpose

The footer is the primary shared navigation surface embedded by feature pages. Its visible options can vary by page and role.

## Destinations

| Destination | Typical purpose | Access |
|---|---|---|
| Dashboard/home | Open the settings-based home view | Authenticated |
| Chart | Open the main chart workflow | Authenticated |
| Orders | View order data and status | Authenticated |
| Watchlist | Manage tracked symbols | Authenticated administrator in current routing |
| Balance | View account balance and history | Authenticated |
| Admin | Open monitoring and maintenance tools | Authenticated administrator |
| Experimental chart options | Open web chart or chart variants | Depends on the route; several are admin-only |

## Behavior

- Navigation uses Angular routes and preserves the current authenticated application context.
- A destination can still fail to load if its backend data or market-data service is unavailable.
- Role protection is enforced by route guards, not only by hiding a footer button.
- The footer is not a trading order-entry control.

## Exceptions

- Some pages may render their own footer variant or omit footer content.
- Admin-only links are unavailable to non-admin users.
- Unknown or unregistered destinations are not valid navigation targets; `/help/faq` is currently not registered.

## Implementation References

- `src/app/components/footer/`
- `src/app/app.routes.ts`

Verification date: 2026-09-11.
