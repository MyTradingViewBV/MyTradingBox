# Alert Settings

## Purpose

Alert Settings controls notifications and market alerts for symbols available through the watchlist configuration.

## Routes and Access

- `/settings/alerts`
- `/settings/alerts/:symbol`
- Required access: authenticated administrator
- Optional query parameter: `exchangeId` can override the exchange context for a symbol deep link.

## Available Functions

- List symbols that can be configured.
- Select a symbol.
- Enable or disable notification settings.
- Configure price-threshold alerts.
- Configure capital-flow alert settings where the symbol/service supports them.
- Open the page with a symbol preselected through the route.
- Save changes and receive toast feedback.

## States and Exceptions

- **Loading:** Symbol and saved-settings data may load separately.
- **No symbols:** The page cannot configure an alert without an available symbol context.
- **Unsaved changes:** Leaving before a successful save may discard edits.
- **Save failure:** Network or validation failures leave the previous saved state unchanged; retry after checking connectivity.
- **Unsupported data:** Not every symbol or exchange necessarily provides every alert type.

## Roles and Navigation

The current route is protected by both `authGuard` and `adminGuard`. Non-admin users are redirected to `/dashboard`. Typical entry points are Watchlist, Coin Information, or a notification-related action.

## Implementation References

- `src/app/components/settings/alerts-settings.component.ts`
- `src/app/modules/shared/services/services/user-notification-settings.service.ts`
- `src/app/modules/shared/services/services/price-threshold-alerts.service.ts`

## Look and feel

A panel card with panel-look coin and toggle rows, uppercase section captions, an input-box price field with a gradient Add button, a bordered Remove button, and toggles with an orange gradient "on" state. Styles use the shared `--mtb-*` tokens (see `docs/STYLE_GUIDE.md`), so dark and light mode follow automatically.

Verification date: 2026-10-13.
