# Documentation Status

This file records behavior that support documentation must describe carefully. It distinguishes implemented workflows from experimental, placeholder, or unresolved behavior.

| Area | Status | Documentation treatment |
|---|---|---|
| Login email/password flow | Implemented | Document validation, loading, authentication failure, and session redirects. |
| Apple/Google login buttons | Placeholder or unverified | Do not describe as available authentication providers. |
| Main chart | Implemented with service/API dependencies | Document route parameters, loading/failure states, live updates, available controls, and the latest-candle guide as shown in the UI. |
| Web chart | Experimental/admin-only | Clearly identify test/fake order state and do not present it as the normal trading workflow. |
| Chart-v3 | Experimental/admin-only | Explain reduced chart features, disabled overlays/actions, and the latest-candle guide when candle data is visible. |
| Market Cipher B chart | Experimental/admin-only | Identify it as a signal-focused variant, not a separate account or order workflow. |
| TV chart | Implemented alternative renderer | Explain that it is an alternate chart surface with its own initialization/live-stream behavior. |
| Orders | Implemented viewing and deletion behavior | Do not claim unsupported order types or guaranteed live status updates. |
| Watchlist | Implemented but admin-guarded | State the current role restriction, symbol management, exchange context, and empty/failure states. |
| Alerts | Implemented but admin-guarded | Document notification, price, and capital-flow settings plus save failures. |
| Account balance | Partially implemented | Identify any placeholder/demo values and separate them from account data returned by services. |
| Release notes | Implemented with generated asset/fallback | Explain empty or unavailable release-note data. |
| Contact FAQ link | Unresolved | `/help/faq` is not an active route in the current route table. |
| Onboarding | Implemented global overlay | Document seven-step flow, skip/finish behavior, persistence, and reappearance conditions. |
| PWA/service-worker diagnostics | Admin tooling | Describe availability/status checks without promising installation or push support on every browser. |

## Documentation Rules

1. Describe current visible behavior, not planned features.
2. Mark admin-only and experimental pages before describing their controls.
3. Separate service/API failures from empty data and from unavailable UI actions.
4. Do not imply that a route, provider, setting, or order type exists unless it is registered and visible in the current application.
5. Review this file whenever a page or route changes.

Verification date: 2026-09-11.
