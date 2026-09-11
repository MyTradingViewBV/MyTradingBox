# Account Balance

## Purpose

Account Balance presents account summary information, profit/loss information, transactions, and balance-log data returned by the account service.

## Route and Access

- Route: `/balance`
- Required access: authenticated user
- Entry points: footer navigation and account-related workflows

## Available Functions

- View the account summary returned by the balance service.
- Review profit/loss and transaction sections when data is available.
- Refresh account data.
- Review balance log entries.
- Navigate back to the previous page or use shared footer navigation.

## States and Exceptions

- **Loading:** Summary and log requests may complete at different times.
- **Empty:** An account may have no transactions or log entries.
- **Account-service failure:** Summary values may be unavailable until the service responds.
- **Log failure:** Balance summary data can load even when the nested balance log request fails.
- **Placeholder values:** Some visible cards or fields may contain demo/placeholder values in the current UI. Treat only service-backed values as authoritative account data.
- **Refresh failure:** A failed refresh does not prove that the account balance changed.

## Roles and Limitations

Any authenticated user can access the route. This page is a display and history surface; it does not document deposit, withdrawal, payment, or risk-management controls unless those controls are visibly present in the deployed build.

## Implementation References

- `src/app/components/account-balance/`
- `AccountBalanceService`
- `AccountBalanceResponse`
- `AccountBalanceLogEntry`

Verification date: 2026-09-11.
