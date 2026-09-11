# Routes and Permissions

This is the authoritative route catalog for the current Angular application. Page guides describe user workflows; this file describes access, aliases, parameters, and redirects.

## Roles

| Role | Access |
|---|---|
| Visitor | Can access `/login` when not already authenticated. |
| Authenticated user | Can access pages protected by `authGuard`. |
| Administrator | Can access authenticated pages plus pages protected by `adminGuard`. The admin decision is derived from the authenticated token. |
| Expired or invalid session | Is redirected to `/login`; the application clears session state during logout handling. |

`adminGuard` does not replace `authGuard`: admin-only routes require both guards.

## Route Matrix

| Route | Page | Access | Parameters / notes |
|---|---|---|---|
| `/` | Settings / home | Authenticated | Default landing route; same component as `/settings`. |
| `/login` | Login | Visitor | `loginGuard` redirects an already authenticated user to `/dashboard`. |
| `/dashboard` | Settings / home | Authenticated | Alias for the settings-based dashboard view. |
| `/orders` | Orders | Authenticated | Loads the current user's order data. |
| `/watchlist` | Watchlist | Authenticated administrator | Watchlist management is currently admin-guarded. |
| `/watchlist/add` | Add symbol | Authenticated administrator | Opened from the watchlist workflow. |
| `/coin/:symbol` | Coin information | Authenticated | `symbol` identifies the requested coin. |
| `/settings/alerts` | Alert settings | Authenticated administrator | Configures alerts for available watchlist symbols. |
| `/settings/alerts/:symbol` | Alert settings | Authenticated administrator | Selects `symbol` on entry; may use an `exchangeId` query parameter. |
| `/settings/release-notes` | Release notes | Authenticated | Uses generated release-note asset data with an empty fallback. |
| `/settings` | Settings | Authenticated | Main settings page. |
| `/chart` | Chart | Authenticated | Opens the chart with the current/default symbol and timeframe. |
| `/chart/:symbol` | Chart | Authenticated | `symbol` selects the chart market. |
| `/chart/:symbol/:timeframe` | Chart | Authenticated | `symbol` and `timeframe` select the chart context. |
| `/web-chart` | Web chart experiment | Authenticated administrator | Experimental chart and test-order workflow. |
| `/chart-v3` | Simple chart variant | Authenticated administrator | Experimental simplified chart with reduced overlays and actions. |
| `/market-cipher-b-chart` | Market Cipher B chart | Authenticated administrator | Experimental signal-focused chart variant. |
| `/tv-chart` | Lightweight chart | Authenticated | Alternative candlestick renderer with live market updates. |
| `/balance` | Account balance | Authenticated | Account summary, P/L, transactions, and balance log. |
| `/admin` | Administration | Authenticated administrator | Monitoring, logs, maintenance, push/PWA diagnostics, and admin tools. |
| `/contact` | Contact and support | Authenticated | Static support and community information. |

## Redirects and Invalid Destinations

- Unauthenticated access to an `authGuard` route is redirected to `/login`.
- An authenticated user visiting `/login` is redirected to `/dashboard`.
- An authenticated non-admin visiting an `adminGuard` route is redirected to `/dashboard`.
- `/help/faq` is referenced by the contact experience but is not registered in the current route table.
- Unknown routes have no documented application-specific fallback in the active route configuration.

## Shared Surfaces

- **Onboarding:** A global overlay, not a route. It appears until onboarding is marked complete in application state/local storage.
- **Footer navigation:** Embedded by feature pages and provides links to the main chart, orders, watchlist, balance, dashboard, and admin/experimental chart areas according to role.
- **Toast notifications:** Shared feedback for successes, warnings, and failures.

## Source References

- Route definitions: `src/app/app.routes.ts`
- Authentication guards: `src/app/modules/shared/auth/guards/`
- Session and role state: `src/app/modules/shared/services/services/app.service.ts`
- Shared application shell: `src/app/app.ts`

Verification date: 2026-09-11.
