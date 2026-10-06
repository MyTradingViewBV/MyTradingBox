# Administration

## Purpose

Admin is an authenticated administrator workspace for system monitoring, application logs, symbol maintenance, assistant tools, notifications, and PWA/service-worker diagnostics.

## Route and Access

- Route: `/admin`
- Required access: authenticated administrator
- Guards: `authGuard` and `adminGuard`
- Non-admin authenticated users are redirected to `/dashboard`.

## Available Areas and Functions

### Heartbeat and Connectivity

- View heartbeat/system health results.
- Inspect service and exchange connectivity indicators.
- Retry health checks when the page exposes a refresh action.

### Logs

- Show application/system log entries when a logs source is available. The API currently exposes no system-logs endpoint, so the panel shows "No logs available" (no mock or generated entries).
- Filter or search log content.
- Review log severity/categories when returned by the service.

### Symbol and AI Maintenance

- Run the available symbol update/maintenance action.
- Review AI queue or assistant-related state where the backend supports it.
- Treat unavailable assistant APIs as an unavailable tool, not as an application-wide failure.

### Trade Assistant

- Open the assistant surface and inspect its current response/state.
- Use only the actions exposed by the deployed build; assistant availability depends on its API.

### Push and PWA Diagnostics

- Inspect notification and push-service state.
- Review service-worker registration/update information.
- Inspect install-prompt and platform diagnostics where supported.
- Use these controls for diagnosis; they do not guarantee that a browser or device supports push or installation.
- Subscribe and test-notification requests are sent with the session token by the HTTP interceptor. With an expired or missing session they fail (and logout is triggered) instead of being sent unauthenticated.

## States and Exceptions

- **Loading:** Each admin segment can request data independently.
- **Empty logs:** The panel shows "No logs available" when there are no entries; no entries may also match the selected filter.
- **Service failure:** Heartbeat, logs, exchange connectivity, or notification diagnostics can fail independently.
- **Assistant unavailable:** The assistant API may be disabled or unreachable.
- **Browser limitations:** PWA install prompts, service workers, and push notifications vary by browser, platform, permissions, and deployment configuration.
- **Unauthorized access:** A missing, expired, or non-admin token prevents access through the route guards.

## Security and Operational Boundaries

Admin actions can affect shared application data or diagnostics. Confirm the selected target before maintenance actions. The page is protected by route guards, but this documentation does not claim a separate audit trail for every action unless the backend explicitly records one.

## Implementation References

- `src/app/components/admin/`
- `HeartbeatService`
- `LogsService`
- `NotificationService`
- `PushNotificationService`
- `SwUpdate`
- `adminGuard`

Verification date: 2026-09-11.
