# MyTradingBox Audit Report

**Date:** 2026-10-06
**Scope:** `C:\repos\prive\MyTradingBox` — Angular 22 SPA (standalone components, NgRx, PWA service worker, Capacitor scaffolding), ~29,700 lines of non-spec TypeScript, 36 components. Frontend for BotAPI; deployed to GitHub Pages. Branch at time of audit: `feature/chart-interaction-system` (with 5 uncommitted modified files).
**Method:** Three parallel reviews — security, code quality/architecture, configuration/dependencies/operations — plus a build verification. All findings verified in source; no files modified.
**Companion report:** the backend audit lives at `C:\repos\prive\API\audit\AUDIT-REPORT.md`.

---

## Executive summary

MyTradingBox is in notably better shape than the backend. Architecture is modern (fully standalone components, new `@for` control flow with tracking, `strict: true` + `strictTemplates`, NgRx with immutability checks, complete en/nl i18n), the test suite is real (780 `it()` blocks, coverage thresholds enforced in CI), CI runs gitleaks secret scanning with SHA-pinned actions, no XSS sinks exist anywhere in the code, and no secrets are committed.

The serious items are few but real:

1. **A documented cross-user data-leakage bug is still live:** `user-symbols.service.ts:94` falls back to a hardcoded test user ID when the actual user ID is missing — the exact root cause written up in `WATCHLIST_INVESTIGATION_FINDINGS.md`, with the fix never applied.
2. **A known high-severity vulnerability in @angular/router 22.1.2** (GHSA-ff3f-86qr-9cv3, SSR DoS); the fix (22.2.1) sits outside the pinned version range. Production also runs a release-candidate `@ngrx/store 22.0.0-rc.0` although stable 22.0.1 is out.
3. **The release path has no gate:** `npm run deploy` builds whatever is in the local working tree (currently dirty) and pushes it straight to public GitHub Pages — no CI involvement, and the GH Pages deployment ships with zero security headers (the hardened nginx.conf is dead config that nothing uses).
4. **Risk is concentrated in one file:** `chart-base.component.ts` is 4,467 lines with 159 of the project's 301 `any` usages and 26 subscription sites.

**Verified build status:** `ng build --configuration production` → **SUCCESS** in 7.7s. Initial bundle 473 kB raw / 127 kB transfer, with sensible lazy chunks per route (largest: tv-chart 170 kB). Healthy.

---

## 1. Security findings

### Medium

| # | Finding | Location |
|---|---------|----------|
| S1 | **JWT access token persisted in localStorage** (`mtb.state.auth.v1`) — readable by any XSS payload; no HttpOnly-cookie option. Mitigating: hydration fails closed (expired/malformed tokens discarded on startup) and no XSS sinks were found (S4). | `src/app/store/persistence/state-persistence.meta-reducer.ts:21,190-204` |
| S2 | **GitHub Pages deployment ships with no security headers** — no CSP, HSTS, or X-Frame-Options, and no `<meta http-equiv>` CSP in index.html. The strict CSP in `nginx.conf:24-33` applies only to a Docker/nginx deployment that doesn't exist. The github.io origin also forces the backend CORS policy to allow a non-mytradingbox.com origin. | `package.json:23` (deploy script), `nginx.conf` |
| S3 | **No token refresh flow; dead scaffolding in the interceptor.** `isRefreshingToken`/`tokenSubject` are declared and never used; session expiry is enforced only by a client-side `setTimeout` auto-logout plus the backend. Combined with the backend's 60-hour tokens (see API audit S11), sessions are long and unrefreshed. | `src/app/modules/shared/auth/interceptors/token.interceptor.ts:26-27`, `appService.ts:133-142` |

### Low

| # | Finding | Location |
|---|---------|----------|
| S5 | **Logout is client-side only and incomplete:** clears NgRx state and navigates to /login, but makes no server-side revocation call and does not unsubscribe Web Push — the device keeps receiving trading-signal pushes after logout. | `src/app/modules/shared/services/services/appService.ts:87-95` |
| S6 | **Dev environment points at the production API:** `environment.ts` has `apiUrl: 'https://mytradingbox.com/'` with the localhost URL commented out — local development sends real tokens to production. No secrets in either env file (the VAPID value is a placeholder; the real public key is fetched at runtime). | `src/environments/environment.ts:6-7` |
| S7 | **Misplaced SQL migration in a frontend repo** — `sql/migrations/chart_state.sql` is backend DDL (no credentials inside). It is also broken: the `UNIQUE (user_id, exchange_id, symbol, timeframe)` constraint references a `timeframe` column the CREATE TABLE never defines, so it cannot run as written. Move (fixed) to the API repo. | `sql/migrations/chart_state.sql` |
| S8 | **Admin gating is client-side JWT role decoding**; adminGuard fails closed, but admin lazy chunks are publicly downloadable from GH Pages — anyone can read the admin UI code and its endpoint URLs. Harmless **only if** BotAPI enforces roles server-side on every admin endpoint (the API audit found several that don't — see API report S6/S7). | `src/app/app.routes.ts`, `admin.guard.ts:12-25` |
| S9 | **Hand-rolled Bearer headers bypass the TokenInterceptor** in 5 places, with the token fetch wrapped in `try {} catch {}` so requests proceed *without* auth when the session is invalid — drifts from the interceptor's fail-closed behavior. | `admin.component.ts:603,633,680,820`, `helpers/push-notification.service.ts:205` |

### Verified clean (positives)

- **No XSS sinks:** zero `[innerHTML]`, `bypassSecurityTrust*`, `DomSanitizer`, `eval`, `document.write`, or `insertAdjacentHTML` in application code; all rendering goes through Angular bindings.
- **No secrets committed:** src/assets and public/ are clean; the single `.gitleaksignore` suppression hides a visibly truncated documentation example, not a real key.
- **Service worker never caches authenticated data:** the only cached dataGroup is public CoinGecko market data; the custom push SW sanitizes payload URLs (rejects cross-origin/out-of-scope) before navigation.
- **No tokens in URLs;** WebSocket feeds are public market data with no credentials; jwt-decode used only for untrusted claim reading inside try/catch.
- **Routes consistently guarded:** every route except /login has `authGuard`; admin surfaces add `adminGuard`, failing closed to /dashboard.

---

## 2. Dependencies & build

| # | Severity | Finding |
|---|----------|---------|
| D1 | High | **Known high-severity vulnerability:** `npm audit --omit=dev` reports @angular/router >=22.0.0 <22.2.0 — "Angular SSR DoS via numeric URL matrix parameters" (GHSA-ff3f-86qr-9cv3). Installed: pinned 22.1.2; fix is 22.2.1, outside the pinned range — needs a coordinated Angular bump to 22.2.x. |
| D2 | High | **Release-candidate package in production:** `@ngrx/store ^22.0.0-rc.0` resolves to 22.0.0-rc.0 in the lockfile even though stable 22.0.1 is published; the caret on an rc tag never advances to stable without a manual change. |
| D3 | Medium | **Version-pinning inconsistency:** exact pins (@angular/* 22.1.2, chart.js, rxjs, typescript) mixed with carets (@ngrx, @ngx-translate, lightweight-charts, zone.js). Notably `@angular/build ^22.1.4` can drift to 22.2.x while `@angular/compiler-cli` stays pinned at 22.1.2. ~20 packages behind latest (majors available: ngx-translate 18, ng2-charts 11, vitest 5, typescript 7). `@angular/animations` is likely removable (merged upstream in v22). |

---

## 3. Deployment & operations

| # | Severity | Finding |
|---|----------|---------|
| O1 | High | **Base-href conflict across three deploy targets.** angular.json production hardcodes `baseHref: "/MyTradingBox/"` (GitHub Pages), but capacitor.config.ts serves the same `dist/MyTradingBox/browser` output from the app root, and nginx.conf serves from `/`. Any production build only works under /MyTradingBox/; nginx/Capacitor consumers would get broken asset paths. One production config cannot serve all three targets. |
| O2 | Medium | **Ungated manual deploys from a dirty tree.** The `deploy` npm script bumps the version, appends `updates/RELEASE_LOG.md`, builds locally, and pushes to public GitHub Pages via angular-cli-ghpages — no CI gate, no clean-tree check. The working tree currently has 5 uncommitted modifications (deploy-script churn: package.json, version.json, RELEASE_LOG.md, release-notes mock). CI builds the app but discards the artifact. |
| O3 | Medium | **Capacitor config is dead/aspirational:** no @capacitor/* packages installed, no ios/ directory, and `capacitor-setup.sh` expects output in `www/` while webDir is `dist/MyTradingBox/browser`. `ExportOptions.plist` is bit-rotted (bitcode keys removed by Apple in Xcode 14+, a typo'd key, and a `thinning` value that breaks plist parsing). Otherwise clean: cleartext only via explicit opt-in env var, `NSAllowsArbitraryLoads: false`. |
| O4 | Low | **nginx.conf and proxy.conf.json are dead config** — nothing references either (no Dockerfile/compose/CI usage; proxy.conf.json isn't wired into angular.json's serve target). Ironically nginx.conf is the best-hardened artifact in the repo. Delete or wire them up. |
| O5 | Low | **Git hygiene is good:** dist/, coverage/, .angular/, node_modules/ untracked; .gitignore correct. But many stale date-named branches (07-2026wip, 10-03-2026-save, …) and main's tip is far behind the feature branch. `environment.ts` version string uses an Azure-DevOps-style `#{Build.BuildNumber}#` token nothing in this repo replaces. |
| O6 | Low | **CI (.github/workflows/ci.yml) is solid:** gitleaks secret scan (checksum-verified, --redact), lint, coverage-thresholded tests, docs check, production build; `permissions: contents: read`, SHA-pinned actions. Gaps: never deploys (so the deploy path is untested), and coverage thresholds are modest (statements 45%, branches 30%). |
| O7 | Low | **Docs are maintained but scattered and partially stale:** three overlapping locations (root .md files, notes/, docs/) with no index; CHANGELOG's only release entry is "[1.0.0] - 2024-01-01" while package.json says 0.2.41; APP_CONTEXT.md still describes Chart.js-only charts and "mocked alerts". `updates/` holds committed one-off AI-session reports. Release-notes tooling ships raw commit subjects publicly in the app bundle — keep commit messages free of internal details. |

---

## 4. Code quality & architecture

| # | Severity | Finding |
|---|----------|---------|
| Q1 | High | **Hardcoded fallback test user ID still live** — `src/app/modules/shared/services/http/user-symbols.service.ts:94`: `const id = actualUserId || '6ce946c1-5099-4fbd-96e3-d1cac747adc7';`. This is the exact root cause documented in `WATCHLIST_INVESTIGATION_FINDINGS.md` (cross-user watchlist data leakage); the investigation is finished and committed, the fix is not. Fail/redirect-to-login instead. |
| Q2 | High | **Chart god class:** `src/app/components/chart/chart-base.component.ts` is 4,467 lines — a `@Directive()` base extended by 4 route components (deliberate reuse), but it mixes live-stream aggregation, candle math, key-zone dataset building, drawing persistence, viewport logic, and direct Chart.js mutation: 26 `.subscribe(` sites, 159 `any` usages, 10 `chart.update` calls. ~10 chart services already exist (chart-interaction.service.ts 1,982 lines, drawing-tools.plugin.ts 1,440) — continue the extraction. |
| Q3 | High | **301 `any` usages in src/app**, over half in chart-base (mostly Chart.js escape hatches). ESLint would catch none of it: `no-explicit-any` is off, ~15 TS rules and most Angular template rules are commented out ("start small"), `template/no-call-expression` disabled, template cyclomatic-complexity max set to 50. Lint runs in CI but enforces very little. |
| Q4 | Medium | **Oversized components:** `admin.component.ts` (1,257 lines — heartbeats, logs, symbols CRUD, push plumbing, SW diagnostics, PWA install prompt in one component) and `watchlist.ts` (1,122 lines). |
| Q5 | Medium | **Service layer bypassed in places:** components inject HttpClient directly (admin.component.ts, coin-info.ts:149, release-notes.component.ts); `admin.component.ts` rebuilds `apiBase` from `environment.apiUrl` five times (lines 264, 583, 622, 669, 802) and duplicates the push-subscribe POST twice (once observable, once `toPromise()`). |
| Q6 | Medium | **RxJS style is subscribe-and-assign:** 93 `.subscribe(` calls, zero `\| async` pipes, only 13 signal usages; three competing cleanup styles (takeUntil(destroy$), takeUntilDestroyed, manual Subscription fields). Leak candidates: `settings.component.ts:354`, `watchlist.ts:196` (subscribe in click handler then navigate), `orders.ts:53,67,122,130` (no destroy handling at all). One nested subscribe at `chart-base.component.ts:2251` (bounded by take(1)). Hot paths are actually cleaned up correctly. |
| Q7 | Medium | **OnPush in only 10 of 36 components** with zone.js active, and 16 function calls in template bindings (chart-base.component.html:175,193,200,348; add-symbol.component.html:36,46; watchlist.html:70) that run on every CD cycle. Loop tracking is fine (all 47 `@for` blocks tracked). Chart pages mitigate via `runOutsideAngular` + manual `detectChanges()`. |
| Q8 | Medium | **No @ngrx/effects / server-state layer:** the store holds UI prefs only (3 feature slices, mostly accessed via a SettingsService facade — 3 direct selects, 14 dispatches); all API calls live in components/services with no caching/dedup. 18 direct `localStorage` call sites outside the persistence meta-reducer form parallel persistence channels. Immutability checks are on (good). |
| Q9 | Low | Defensive `try { } catch {}` around subscription setup in chart-base ngOnInit (~lines 795-885) swallows real errors. i18n is complete (280 keys in both en and nl, zero missing) but some logic matches English label strings (`settings.component.ts:210`), which breaks if labels are ever translated. Near-zero commented-out code or TODO markers. |

**Tests:** real and substantial — 57 spec files vs 66 component/service files, 780 `it()` blocks, 2,158 asserts with behavioral names; chart-base alone has 87 tests; reducers and the persistence meta-reducer are covered. Coverage ≈ 48% statements / 33.5% branches / 51% functions — respectable; branches dragged down by the chart monolith.

---

## 5. Prioritized action plan

**P0 — do immediately:**
1. Remove the hardcoded user-ID fallback in `user-symbols.service.ts:94` (Q1) — it's a live cross-user data-exposure vector that was already root-caused.
2. Bump @angular/* to 22.2.x to clear the high-severity router vulnerability (D1); move @ngrx/store to stable 22.0.1 (D2).

**P1 — this week:**
3. Gate the release path: deploy from CI (or at minimum enforce a clean tree + tests before angular-cli-ghpages) (O2); add a CSP via `<meta http-equiv>` in index.html since GH Pages can't set headers (S2).
4. Make logout revoke server-side and unsubscribe Web Push (S5); route the hand-rolled Bearer-header calls through the TokenInterceptor and remove its dead refresh scaffolding — or implement an actual refresh flow to pair with shorter backend token lifetimes (S3, S9).
5. Point `environment.ts` at localhost/a staging API so dev stops writing to production (S6); move the fixed `chart_state.sql` migration to the API repo (S7).

**P2 — structural:**
6. Continue decomposing `chart-base.component.ts` into the existing chart services; target <1,000 lines — this also addresses half the `any` count (Q2, Q3).
7. Re-enable lint teeth (`no-explicit-any` as warn, `template/no-call-expression`, lower template complexity) and fix the 16 template function calls (Q3, Q7).
8. Adopt OnPush + signals in the non-chart components; standardize on `takeUntilDestroyed` (Q6, Q7); consolidate HTTP access behind the service layer with a single API-base helper (Q5).
9. Decide the deployment story: one target per build config (base href per target), delete or wire up the dead nginx/Capacitor/proxy configs (O1, O3, O4).
10. Docs cleanup: single docs index, update APP_CONTEXT.md and CHANGELOG, remove one-off AI-session reports from `updates/` (O7).
