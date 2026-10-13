# Login

## Purpose

Login authenticates an existing user and starts the application session used by protected pages.

## Route and Access

- Route: `/login`
- Available to: unauthenticated visitors
- Guard: `loginGuard` redirects an already authenticated user to `/dashboard`

## Layout

Top to bottom: logo, `MyTradingBox` title with tagline, "Welcome back" heading, email and password fields (always visible, each with an icon and a small uppercase label; password has a show/hide toggle), the gradient **Continue** button, an OR divider, **Continue with Google** and **Continue with Apple**, terms and privacy links, the motto, and small **Clear Local Storage** and version entries. A decorative candlestick and ridge background is drawn with inline SVG. Non-production builds also show the **Show login debug** button.

## Available Functions

- Enter email and password.
- Submit the login form.
- Receive validation and authentication feedback.
- Observe online/debug status information exposed by the current UI.
- The Google and Apple buttons are placeholders: they do not start OAuth and only record the chosen login option.

## Typical Workflow

1. Enter the required credentials.
2. Submit the form.
3. Wait for the authentication request to complete.
4. On success, continue to the authenticated application and onboarding if it is incomplete.
5. On failure, correct the credentials or restore connectivity and retry.

## States and Exceptions

- **Validation failure:** Required or malformed fields keep **Continue** disabled; field errors appear once a field has been left (touched).
- **Loading:** The submit action is in progress and should not be repeatedly triggered.
- **Invalid credentials:** The server rejects authentication and the user remains unauthenticated.
- **Network/API failure:** The session cannot start until the authentication service is reachable.
- **Existing session:** `loginGuard` redirects to `/dashboard` instead of showing the login workflow.
- **Storage cleanup:** The login flow can clear stale application state as part of recovery.

## Roles and Security Notes

Successful login establishes authentication; administrator access is determined separately from the authenticated token and enforced by `adminGuard`. Do not infer OAuth, two-factor authentication, encrypted credential storage, or brute-force protection from this page unless those features are confirmed by the deployed authentication service.

## Implementation References

- `src/app/components/login/`
- `src/app/modules/shared/auth/`
- `AppService`
- `NotificationService`

Verification date: 2026-10-13.
