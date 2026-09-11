# MyTradingBox User Manual

This manual describes the current user workflows. Access to individual pages still depends on the route guards and the authenticated account role; see [Routes and Permissions](ROUTES_AND_PERMISSIONS.md).

## 1. Sign In

1. Open `/login`.
2. Enter the required email and password.
3. Submit the form and wait for the authentication result.
4. On success, continue to the home/dashboard view.
5. If authentication fails, check the credentials and network connection before retrying.

The current provider buttons are not documented as working Apple or Google authentication. Existing sessions are redirected from `/login` to `/dashboard`.

See [Login](components/LOGIN.md).

## 2. Complete Onboarding

Onboarding appears as a global overlay when completion has not been recorded. Use Next and Back to move through the seven steps, or skip/finish according to the available controls. Completion is persisted locally and can be lost when application storage is cleared.

See [Onboarding](components/ONBOARDING.md).

## 3. Configure Home and Settings

From `/`, `/dashboard`, or `/settings`, users can configure the active exchange, language, available theme/UI settings, onboarding-related options, feedback, version/update checks, and logout. The same component serves all three routes.

Settings does not currently promise general profile, payment, risk, security, or default-order-type configuration.

See [Settings and Home](components/SETTINGS.md).

## 4. Navigate the Application

Use the footer when it is present to open Home, Chart, Orders, Watchlist, Balance, Admin, or chart variants. Admin-only destinations remain protected by route guards even if a link is visible or manually entered.

See [Footer Navigation](components/FOOTER_NAVIGATION.md).

## 5. Analyze a Market

1. Open Chart.
2. Select an exchange, symbol, and timeframe.
3. Wait for candle data to load.
4. Enable the indicators, boxes, key zones, divergences, or drawing tools needed for analysis.
5. Use symbol links to move to Coin Information, Orders, Watchlist, or alerts.

The chart shows a small guide from the latest candle close to the right price axis and down to the corresponding timestamp. It appears after candle data loads and follows live candle updates; it is hidden when the latest candle is outside the visible range.

The main chart is a market-analysis surface. Do not assume that it provides direct live order placement unless the deployed UI explicitly shows that control.

See [Main Chart](components/CHART.md) and [Chart Variants](components/CHART_VARIANTS.md).

## 6. Manage a Watchlist

The current `/watchlist` route is administrator-protected.

1. Open Watchlist.
2. Search or sort the configured symbols.
3. Review ticker, profile, box, and signal information where available.
4. Open a symbol's Coin Information or Chart page.
5. Use Add Symbol to search available exchange symbols and add or remove entries.

Ticker, profile, signal, and box data can fail independently. A visible symbol does not guarantee that its market is tradeable.

See [Watchlist](components/WATCHLIST.md) and [Add Symbol](components/ADD_SYMBOL.md).

## 7. Configure Alerts

Alert routes are currently administrator-protected.

1. Open `/settings/alerts` or a symbol-specific alert route.
2. Select or confirm the symbol.
3. Configure notification, price-threshold, and supported capital-flow settings.
4. Save and verify the success feedback.

An `exchangeId` query parameter may be used for a symbol-specific deep link. Save failures leave the previous persisted state unchanged.

See [Alert Settings](components/ALERTS.md).

## 8. Review Orders

1. Open Orders.
2. Wait for order/trade-plan data.
3. Filter and expand records using the available controls.
4. Open an order symbol on Chart for context.
5. Delete a record only when the page exposes the action and the backend accepts it.

Orders documentation covers the current review and deletion behavior. It does not promise unsupported order types or a guaranteed real-time execution feed.

See [Orders](components/ORDERS.md).

## 9. Review Account Balance

Open Balance to review service-backed account summary, P/L, transactions, and balance logs. Summary and log requests can fail independently. Some visible cards may contain demo or placeholder values; treat service-backed values as authoritative.

See [Account Balance](components/ACCOUNT_BALANCE.md).

## 10. Read Release Notes

Open Settings -> Release Notes or `/settings/release-notes`. Release entries are loaded from the application asset and may be empty or fallback/generated data. This page is informational and does not change application settings.

See [Release Notes](components/RELEASE_NOTES.md).

## 11. Use Administration Tools

Admin is restricted to authenticated administrators. It includes heartbeat and connectivity checks, logs and filters, symbol maintenance, assistant/AI state, notification and push diagnostics, and PWA/service-worker information.

Browser support, permissions, deployment configuration, and backend availability affect these tools. Experimental chart pages and web test-order workflows should not be treated as ordinary live trading pages.

See [Administration](components/ADMIN.md).

## 12. Get Support

Open Contact for the configured support email, service information, and external links. The current UI references `/help/faq`, but that route is not registered, so the FAQ destination may not work.

See [Contact and Support](components/CONTACT.md).

## Troubleshooting

### A protected page redirects to login

The session is missing or expired. Sign in again. The authentication guards restore or clear session state as part of their normal flow.

### An admin page redirects to home

The authenticated token does not provide administrator access, or the session is no longer valid.

### A chart is empty or stale

Check the exchange, symbol, timeframe, and network connection. Historical candle, overlay, and live-data requests can fail independently.

### A watchlist or alert change did not persist

Check connectivity, wait for the save feedback, and reload the page before repeating the action.

### Balance values look unexpected

Separate service-backed values from demo/placeholder cards and check whether the balance or log request failed independently.

### Push, installation, or updates are unavailable

Browser/platform support, permissions, service-worker registration, and deployment configuration all affect PWA behavior. Admin diagnostics can show the current status but cannot enable unsupported platform features.

## Related Documentation

- [Page Documentation Index](components/README.md)
- [Routes and Permissions](ROUTES_AND_PERMISSIONS.md)
- [Documentation Status](DOCUMENTATION_STATUS.md)
- [How It Works](HOW_IT_WORKS.md)
- [Deployment](DEPLOYMENT.md)

Verification date: 2026-09-11.
