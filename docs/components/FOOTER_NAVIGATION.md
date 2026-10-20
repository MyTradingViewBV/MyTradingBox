# Footer Navigation

## Purpose

The footer is the primary shared navigation surface embedded by feature pages. Its visible options can vary by page and role.

## Destinations

| Destination | Typical purpose | Access |
|---|---|---|
| Dashboard/home (⚙️ Settings) | Open the settings-based home view (`/dashboard`) | Authenticated |
| Dashboard (📈, web mode only) | Open the Dashboard page (`/overview`); mobile reaches it from Settings → Actions | Authenticated |
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

## Look and feel

- The footer follows the login-page style (`docs/STYLE_GUIDE.md`): `--mtb-bg` background, soft `--mtb-border-soft` top border, muted labels that turn white (dark) or dark (light) on hover and keyboard focus.
- The web options sheet is a panel with secondary-style buttons; the web entry uses the accent text colour.
- The footer is also visible on the chart pages and uses the same tokens there.
- The shared header buttons (back, close, refresh) share `src/app/components/shared/action-button.scss` (bordered panel button, orange icon). The toast uses status tokens (`--mtb-success`, `--mtb-danger`, `--mtb-warning`, orange for info).

Verification date: 2026-10-20.
