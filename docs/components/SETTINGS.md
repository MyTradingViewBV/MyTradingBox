# Settings and Home

## Purpose

Settings is both the authenticated home/dashboard view and the application's preference center. The routes `/`, `/dashboard`, and `/settings` use this component.

## Routes and Access

- `/`
- `/dashboard`
- `/settings`
- Required access: authenticated user

## Available Functions

- Select the active exchange.
- Select application language.
- Change the available UI mode and dark/light theme behavior.
- Control onboarding-related settings where exposed.
- Open Chart, Orders, Watchlist, Balance, Contact, and Release Notes through available navigation.
- Open admin tools when the authenticated user is an administrator.
- Clear application storage/state where the control is provided.
- Submit feedback through the configured feedback component/service.
- Log out and clear the authenticated session.
- Check the displayed application version and available updates.

## Typical Workflow

1. Open Settings or the home/dashboard route.
2. Choose the exchange and language.
3. Adjust appearance or onboarding preferences.
4. Navigate to a feature page or open Release Notes.
5. Use logout when ending the session on a shared device.

## States and Exceptions

- **Startup loading:** Language, theme, version, and persisted settings can initialize independently.
- **Persistence failure:** A preference may appear changed locally but fail to persist through the settings service.
- **Storage clear:** Clearing application state can remove onboarding completion, selected context, and other locally persisted values.
- **Update unavailable:** Version checks and service-worker updates depend on deployment and network state.
- **Feedback failure:** Feedback submission depends on its configured external/service integration.
- **Role filtering:** Admin links may be hidden or protected, but route guards remain the final access check.

## Roles and Limitations

All authenticated users can access the base page. The current implementation does not establish general profile, payment, security, risk-management, or default-order-type settings; those should not be promised in support documentation.

## Implementation References

- `src/app/components/settings/`
- `SettingsService`
- NgRx app/settings state
- `ThemeService`
- `VersionService`

Verification date: 2026-09-11.
