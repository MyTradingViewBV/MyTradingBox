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
- Log out and clear the authenticated session. Logout also asks the API to revoke the refresh token and removes this device's push subscription, so the device stops receiving notifications. Both steps are best-effort: logout completes even when the API is unreachable. After a page reload the refresh token is no longer held in the browser, so only the push subscription is removed.
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
- **Storage clear:** Clearing application state signs the session out of the store and resets settings (selected exchange, theme); onboarding completion is kept and is controlled by the "Show Onboarding Wizard" toggle, which immediately shows or hides the onboarding overlay.
- **Persistence:** Preferences live in the NgRx store; the store's persistence meta-reducer (`src/app/store/persistence/`) writes the session, selected exchange, dark mode and onboarding status to versioned local-storage keys.
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
