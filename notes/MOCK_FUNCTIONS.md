# Mock / Placeholder Functions

Overview of all mock, hardcoded, and placeholder implementations that need to be replaced with real data.

---

## 1. Admin Logs — Fake Log Generator

**File:** `src/app/components/admin/services/logs.service.ts`

- **Initial seed data** (lines 12-16): BehaviorSubject initialized with 3 hardcoded mock log entries
- **Constructor interval** (lines 24-34): Generates random fake log entries every 5 seconds from hardcoded message arrays
- **`seedBurst()`** (lines 39-46): Injects 3 hardcoded fake log entries with `(mock)` suffix

**Called from:** `admin.component.ts` — constructor (line 139) and `loadData()` (line 341)

**Replace with:** Real log stream from bot002 API or SignalR

---

## 2. Account Balance — Hardcoded Values

**File:** `src/app/components/account-balance/account-balance.component.ts`

- **Line 52:** `change: '+22.04%'` — Hardcoded percentage change placeholder
- **Line 59:** `change: '+18.5%'` — Hardcoded percentage placeholder
- **Line 82:** `value: '-$110.10'` — Hardcoded realized P/L value
- **Lines 94-99:** Hardcoded demo recent transactions array (BTC, ETH, HBAR, SOL)
- **Line 43:** Placeholder calculation logic comment (`// Bereken eenvoudige procentuele veranderingen`)

**Replace with:** Real balance/P&L data from exchange API

---

## 3. Watchlist Matrix — Mock Signal Data

**File:** `src/app/components/watchlist/matrix/watchlist-matrix.component.ts`

- **`buildMockData()`** (lines 81-88): Generates fake market signal rows (bullish/bearish/neutral pattern)
- **Line 64:** Falls back to `buildMockData()` on API error

**Replace with:** Ensure API always returns real data; remove mock fallback

---

## 4. Release Notes — Mock Content

**File:** `src/app/components/settings/release-notes.component.ts`

- **Lines 40-42:** Hardcoded mock product update entry: `'Prepared a temporary per-version history layout that can later be fed by real release data.'`

**Replace with:** Real release data from API or static JSON

---

## 5. Login — OAuth Placeholder

**File:** `src/app/components/login/login.component.ts`

- **Line 166:** OAuth integration placeholder — just shows the form instead of real OAuth flow

**Replace with:** Actual OAuth provider integration

---

## 6. SignalR Guard — Disabled

**File:** `src/app/modules/shared/auth/guards/signalr.guard.ts`

- **Line 10:** `// TODO fix guard` — Always returns `true`, guard is effectively disabled

**Replace with:** Real guard logic checking SignalR connection state

---

## 7. Chart — Temporary Disablements

**File:** `src/app/components/chart/chart-component.ts`

- **Lines 1909-1912:** Live candles disabled for 12m/24m timeframes (`// TEMP: Disable live candles`)
- **Line 1887:** Disabled note appended for 12m/24m timeframes
- **Line 3078:** `refreshKeyZoneVisibility()` — deprecated stub kept for reference

**Replace with:** Enable live candles for all timeframes once data source supports them

---

## 8. Push Notifications — Kill Switch

**File:** `src/app/helpers/push-notification.service.ts`

- **Line 27:** `environment.disablePush` — Temporary kill-switch flag

**Replace with:** Remove kill-switch once push is stable in production

---

## Test Mocks (spec files — expected, no action needed)

| File | Mock classes |
|------|-------------|
| `watchlist.spec.ts` | MockChartService, MockSettingsService, MockUserSymbolsService, MockRouter, MockLocation |
| `admin.component.spec.ts` | MockSettingsService, MockHeartbeatService, MockLogsService |
| `login.component.spec.ts` | mockAuth, mockRouter, mockApp jasmine spies |
| `footer-compenent.spec.ts` | MockSwUpdate, MockRouter |
| `token-expiry.util.spec.ts` | Dummy token builder |
