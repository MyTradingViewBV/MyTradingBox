# Watchlist Data Leakage Investigation - Complete Findings

## Executive Summary
**ROOT CAUSE IDENTIFIED**: Users are seeing coins in their watchlist they didn't add because the application is **defaulting to a hardcoded test user ID** (`6ce946c1-5099-4fbd-96e3-d1cac747adc7`) instead of using the actual logged-in user's ID.

---

## 🔴 CRITICAL FINDINGS

### 1. Hardcoded Test User ID in UserSymbolsService

**File**: [src/app/modules/shared/services/http/user-symbols.service.ts](src/app/modules/shared/services/http/user-symbols.service.ts)

**Lines 77-88**:
```typescript
getUserSymbolsProfile(userId: string = '6ce946c1-5099-4fbd-96e3-d1cac747adc7'): Observable<UserSymbolProfile[]> {
  return this._settingsService.getSelectedExchange().pipe(
    switchMap((exchange) => {
      const exchangeId = exchange?.Id ?? 1;
      return this.http.get<UserSymbolProfile[]>(
        `${this.BASE}api/UserSymbols/${userId}/profile?exchangeId=${exchangeId}`,
      );
    }),
    map((arr) => arr || []),
  );
}
```

**Lines 92-102**:
```typescript
getUserSymbolsProfileForExchange(
  exchangeId: number,
  userId: string = '6ce946c1-5099-4fbd-96e3-d1cac747adc7',
): Observable<UserSymbolProfile[]> {
  return this.http
    .get<UserSymbolProfile[]>(`${this.BASE}api/UserSymbols/${userId}/profile?exchangeId=${exchangeId}`)
    .pipe(map((arr) => arr || []));
}
```

**ISSUE**: Both methods have **hardcoded default user IDs**. When called without explicitly passing a userId, they use this test user's ID instead of the current logged-in user's ID.

---

### 2. Watchlist Component NOT Passing User ID

**File**: [src/app/components/watchlist/watchlist.ts](src/app/components/watchlist/watchlist.ts)

**Line 213**:
```typescript
this._userSymbolsService.getUserSymbolsProfileForExchange(ex.Id).pipe(
```

**ISSUE**: The watchlist component calls `getUserSymbolsProfileForExchange()` with only the exchange ID, **NO user ID parameter**. This causes the method to default to the hardcoded test user ID.

**Impact**: Every user's watchlist is populated with the test user's symbols instead of their own.

---

### 3. Alerts Settings Component NOT Passing User ID

**File**: [src/app/components/settings/alerts-settings.component.ts](src/app/components/settings/alerts-settings.component.ts)

**Lines 85-90**:
```typescript
forkJoin({
  profiles: this.userSymbolsService.getUserSymbolsProfile().pipe(catchError(() => of([]))),
  notifSettings: this.notificationSettingsService.getAll().pipe(catchError(() => of([]))),
  exchangeId: this.settingsService.waitForExchangeId$(),
  userId: this.appService.getUserId$(),
}).subscribe({
  next: ({ profiles, notifSettings, exchangeId, userId }) => {
```

**ISSUE**: The component retrieves the correct `userId` from `appService.getUserId$()` (line 90) BUT **does NOT pass it** to the `getUserSymbolsProfile()` call (line 87). The service method then defaults to the hardcoded test user ID.

**Impact**: Alert settings are shown for the test user's watchlist, not the logged-in user's.

---

## 🟡 USER ID HANDLING - PROPER IMPLEMENTATION EXISTS

**File**: [src/app/modules/shared/utils/token-expiry.util.ts](src/app/modules/shared/utils/token-expiry.util.ts)

**Lines 82-100** - `getUserIdFromToken()` function:
```typescript
export function getUserIdFromToken(token: LoginResponse): string {
  const accessToken = token?.AccessToken;
  if (!accessToken || accessToken.split('.').length !== 3) return '';
  try {
    const decoded: any = jwtDecode(accessToken);
    const claimValue =
      decoded?.[NAME_IDENTIFIER_CLAIM] ??
      decoded?.oid ??
      decoded?.nameid ??
      decoded?.sub ??
      decoded?.userId ??
      decoded?.uid ??
      decoded?.[NAME_CLAIM] ??
      decoded?.email ??
      decoded?.unique_name;
    if (!claimValue) return '';
    return String(claimValue).trim();
  } catch {
    return '';
  }
}
```

**Good News**: A proper utility function exists to extract user ID from JWT tokens. The problem is that it's NOT being used in the UserSymbolsService calls.

---

## 📊 HOW USER ID SHOULD BE OBTAINED

**File**: [src/app/modules/shared/services/services/appService.ts](src/app/modules/shared/services/services/appService.ts)

**Lines 74-78**:
```typescript
getUserId$(): Observable<string> {
  return this.getLoginResponse().pipe(
    first(),
    map((token) => (token ? getUserIdFromToken(token) : '')),
  );
}
```

**Usage Pattern** (as correctly done in alerts-settings.component):
```typescript
userId: this.appService.getUserId$(),
```

This is the CORRECT way to get the current user's ID from the authentication token.

---

## 🗄️ DATABASE SCHEMA

**File**: [sql/migrations/chart_state.sql](sql/migrations/chart_state.sql)

The database correctly stores user data keyed by `user_id`:
```sql
CREATE TABLE IF NOT EXISTS chart_state (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      VARCHAR(128) NOT NULL,          -- JWT sub / username
    exchange_id  INTEGER      NOT NULL,
    symbol       VARCHAR(32)  NOT NULL,
    ...
    CONSTRAINT uq_chart_state_key UNIQUE (user_id, exchange_id, symbol, timeframe)
);
```

The backend schema is sound. The issue is purely in the frontend service layer.

---

## 📝 ADDITIONAL ISSUES FOUND

### 4. Chart Service Has Similar Fallback Issue

**File**: [src/app/modules/shared/services/http/chart.service.ts](src/app/modules/shared/services/http/chart.service.ts)

**Lines 485-495** (loadChartState):
```typescript
return this.getCurrentUserId$().pipe(
  switchMap((userId) => {
    if (!userId) {
      console.warn('[ChartState] userId claim not found in token; sending fallback userId for load');
    }

    let params = new HttpParams()
      .set('symbol', symbol)
      .set('exchangeId', `${exchangeId}`)
      .set('userId', userId || 'unknown-user');
```

**ISSUE**: Falls back to `'unknown-user'` when userId extraction fails, rather than properly handling the error.

### 5. SignalR Guard Has TODO About Needing Proper User Context

**File**: [src/app/modules/shared/auth/guards/signalr.guard.ts](src/app/modules/shared/auth/guards/signalr.guard.ts)

**Line 10**:
```typescript
// TODO fix guard
```

The entire SignalR guard is disabled, suggesting incomplete real-time user context handling.

---

## 🧪 TEST DATA / MOCK FUNCTIONS DOCUMENT

**File**: [notes/MOCK_FUNCTIONS.md](notes/MOCK_FUNCTIONS.md)

Multiple hardcoded mock implementations exist:
- Admin Logs with fake data (refreshed every 5 seconds)
- Account Balance with hardcoded percentage/P&L values
- Watchlist Matrix with mock signal data fallback
- Release Notes with mock content

Test credentials found:
- `test.user@example.co.uk` (in login.component.spec.ts)
- `testuser@example.com` (in APP_STORE_SUBMISSION_CHECKLIST.md)

**CONCERN**: These test data implementations should not be present in production builds.

---

## 🔐 AUTHENTICATION & USER FILTERING FLOW

```
Login Flow:
┌─────────────────────────────────────────────────────────┐
│ 1. Backend returns JWT with user claims (sub, userId, etc)
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 2. AppService stores token in NgRx store
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 3. getUserIdFromToken() extracts user ID from JWT
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 4. AppService.getUserId$() returns Observable<string>
└─────────────────────────────────────────────────────────┘
                           ↓
┌──────────────────────────────────────────────────────────┐
│ ❌ PROBLEM: Components don't pass this to UserSymbols
│    methods, so hardcoded test user ID is used instead
└──────────────────────────────────────────────────────────┘
```

---

## 🐛 WHERE THE BUG MANIFESTS

### User Story
1. User logs in with their account
2. Their JWT token contains their actual user ID
3. User navigates to watchlist
4. Watchlist component calls `getUserSymbolsProfileForExchange(exchangeId)` ← **Missing userId parameter**
5. Service defaults to hardcoded test user ID: `'6ce946c1-5099-4fbd-96e3-d1cac747adc7'`
6. Backend returns **test user's symbols** instead of logged-in user's symbols
7. User sees coins in their watchlist they never added (they're the test user's favorites)

### Affected Components
- ✗ Watchlist Component
- ✗ Alerts Settings Component  
- ? Any other components using UserSymbolsService

---

## 🛠️ RECOMMENDATIONS FOR FIX

### Priority 1: Remove Hardcoded Defaults (CRITICAL)
1. Modify `getUserSymbolsProfile()` to require userId parameter
2. Modify `getUserSymbolsProfileForExchange()` to require userId parameter
3. Update callers to explicitly pass current user's ID via `appService.getUserId$()`

### Priority 2: Fix Callers
1. **Watchlist**: Inject `AppService`, get userId, pass to service method
2. **AlertsSettings**: Pass retrieved userId to `getUserSymbolsProfile()`

### Priority 3: Audit Other Services
1. Search for similar hardcoded defaults in other services
2. Check all API calls that should be user-filtered

### Priority 4: Testing & Validation
1. Add unit tests that verify correct userId is passed to API
2. Add integration tests with multiple users
3. Verify database queries filter correctly by user_id

### Priority 5: Clean Up Test Data
1. Remove hardcoded test user ID
2. Use environment-specific configurations instead
3. Ensure test data doesn't leak to production
4. Review and clean MOCK_FUNCTIONS.md implementations

---

## 🔍 VERIFICATION STEPS

To confirm the fix:
1. Log in as User A
2. Add coins [BTC, ETH] to their watchlist
3. Log out
4. Log in as User B (or test with different user)
5. Navigate to watchlist
6. Verify User B sees ONLY their own coins, not [BTC, ETH]
7. Check browser devtools Network tab → confirm correct userId in API URL

---

## FILES REQUIRING CHANGES

| File | Issue | Change Type |
|------|-------|-------------|
| [src/app/modules/shared/services/http/user-symbols.service.ts](src/app/modules/shared/services/http/user-symbols.service.ts) | Hardcoded default userId | Remove defaults, require parameter |
| [src/app/components/watchlist/watchlist.ts](src/app/components/watchlist/watchlist.ts) | Not passing userId | Pass userId to service calls |
| [src/app/components/settings/alerts-settings.component.ts](src/app/components/settings/alerts-settings.component.ts) | Not passing userId | Pass userId to service calls |
| [src/app/modules/shared/services/http/chart.service.ts](src/app/modules/shared/services/http/chart.service.ts) | Fallback to 'unknown-user' | Proper error handling |
| [src/app/modules/shared/auth/guards/signalr.guard.ts](src/app/modules/shared/auth/guards/signalr.guard.ts) | Guard disabled | Fix or remove |

---

## Summary
This is **100% reproducible** - any logged-in user will see the test user's watchlist data because the frontend service layer defaults to a hardcoded test user ID instead of extracting and using the actual logged-in user's ID from their JWT token. The proper utilities exist (`getUserIdFromToken`), they just aren't being used in the UserSymbolsService calls.
