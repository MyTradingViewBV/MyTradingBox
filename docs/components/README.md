# Page Documentation Index

These guides describe the current routed pages and shared user-facing surfaces. Each page guide covers purpose, access, functions, workflows, states, exceptions, and limitations.

## Start Here

- [Routes and Permissions](../ROUTES_AND_PERMISSIONS.md) - Complete route, guard, role, redirect, and parameter matrix
- [Documentation Status](../DOCUMENTATION_STATUS.md) - Placeholders, experimental behavior, and unresolved items
- [User Manual](../USER_MANUAL.md) - Task-oriented workflows for users and support

## Authentication and Shared Surfaces

- [Login](LOGIN.md) - Email/password authentication and session entry
- [Onboarding](ONBOARDING.md) - Global seven-step first-use overlay
- [Footer Navigation](FOOTER_NAVIGATION.md) - Shared navigation destinations and role behavior

## Trading and Market Data

- [Main Chart](CHART.md) - Exchange, symbol, timeframe, candles, overlays, and live data
- [Chart Variants](CHART_VARIANTS.md) - TV, web, v3, and Market Cipher B routes
- [Coin Information](COIN_INFO.md) - Symbol details, ticker data, and chart/alert links
- [Orders](ORDERS.md) - Order and trade-plan review, filtering, navigation, and deletion

## Watchlist and Alerts

- [Watchlist](WATCHLIST.md) - Symbol monitoring and management
- [Add Symbol](ADD_SYMBOL.md) - Search and add/remove watchlist symbols
- [Alert Settings](ALERTS.md) - Notification, price, and capital-flow settings

## Account and Settings

- [Settings and Home](SETTINGS.md) - Home aliases, preferences, theme, language, updates, and logout
- [Account Balance](ACCOUNT_BALANCE.md) - Account summary, P/L, transactions, and balance logs
- [Release Notes](RELEASE_NOTES.md) - Authenticated release-note view and fallback behavior

## Administration and Support

- [Administration](ADMIN.md) - Monitoring, logs, maintenance, assistant, push, and PWA diagnostics
- [Contact and Support](CONTACT.md) - Support and external resource links

## Documentation Conventions

- Route access is authoritative in [Routes and Permissions](../ROUTES_AND_PERMISSIONS.md).
- `authGuard` means an authenticated session is required.
- `adminGuard` means administrator access is required in addition to authentication.
- A documented limitation is intentional: it describes a current caveat rather than promising future behavior.
- Source references identify the implementation areas used to verify the page guide.

Verification date: 2026-09-11.
