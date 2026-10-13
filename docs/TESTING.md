# Testing

- Unit tests: `ng test` (in `src/`).
- Logged-out smoke tests: `npm run e2e` (`e2e/*.spec.ts`, API traffic blocked, no credentials).

## Screen captures (before/after restyle)

`npm run e2e:screens` logs in through the UI against the LOCAL API and saves full-page
screenshots of every screen, dark and light, mobile (390x844 @2x, iPhone UA) and desktop
(1440x900). It is separate from `npm run e2e` and never runs there.

1. Start the local environment (`C:\repos\mcb-localtest` start script): local API on
   https://localhost:7212 and the frontend dev server on http://localhost:4200.
2. Set credentials in the environment (never in files):
   `$env:E2E_USER='localtest@local.test'; $env:E2E_PASSWORD='...'`
3. Run: `$env:SCREENS_LABEL='before'; npm run e2e:screens`
   - `E2E_BASE_URL` (default `http://localhost:4200`). Must be a localhost / 127.0.0.1 URL: any other URL makes the tool refuse to start. Use `localhost` (not 127.0.0.1) so the local API's CORS applies.
   - `SCREENS_LABEL` (default `current`), `SCREENS_DIR` (default `./screens-output`)
4. Output: `screens-output/<label>/<mobile|desktop>/<route>-<dark|light>.png` (gitignored),
   plus `onboarding-*` and a logged-out `login-*`. The login state is stored in `e2e/.auth/` (gitignored).
5. After the restyle run again with another label and list differences:
   `npm run e2e:screens:compare -- before after` (byte comparison).

Without `E2E_USER`/`E2E_PASSWORD` the login step and all logged-in screens are skipped.

Safety checks (credentials are real, so the tool only talks to local services):
- the config refuses to run when `E2E_BASE_URL` is not localhost/127.0.0.1;
- the login setup aborts before typing the password when `apiUrl` in `src/environments/environment.ts` is not a localhost URL, and it aborts and fails on any non-local POST request during login;
- a logged-in route that ends up on `/login` (missing or expired session) FAILS its capture instead of saving a login screenshot (delete `e2e/.auth` and run again).

`npm run e2e:screens:compare -- before after` reports `DIFF` (bytes differ), `MISSING` (only in the first label) and `ONLY-B` (only in the second label), and prints a clear error with the available labels when a label folder does not exist.

Chromium runs with `--disable-web-security` here only, because the local API's CORS allows
just `http://localhost:4200` and `:4300`. Inner scroll containers are handled by enlarging the
viewport to the content height (capped at 8000 px).

## Screenshot regression tests

`e2e/screens/snapshots.screens.ts` uses `expect(page).toHaveScreenshot()`. It belongs to the `snapshots` project of the screens config, so `npm run e2e` never runs it (that command stays at the 8 smoke tests) and `npm run e2e:screens` only runs the `capture` project.

Covered, each in mobile and desktop, dark and light (16 baselines in `e2e/screens/__snapshots__/`, committed):
- `login` (logged out) and `onboarding` step 1: no API needed, `mytradingbox.com` and `localhost:7212` are blocked;
- `settings` and `watchlist` logged in against the local API (same environment and credentials as the screen captures; skipped without `E2E_USER`/`E2E_PASSWORD`). Dynamic content is masked: version text, watchlist prices, changes, levels and progress bars.

The tolerance is `maxDiffPixelRatio: 0.02` (set in the screens config).

Run (dev server on `http://localhost:4200`, or set `E2E_BASE_URL`; the watchlist baseline expects the 2 test symbols BTCUSDT and ETHUSDT):

```powershell
. C:\repos\mcb-localtest\config.ps1
$env:E2E_USER=$TestUser; $env:E2E_PASSWORD=$TestPassword
npm run e2e:snapshots
```

After an intended visual change, refresh the baselines, review the changed PNGs and commit them:

```powershell
npm run e2e:snapshots -- --update-snapshots
```

A failing run writes actual/expected/diff images to `test-results/screens/`. Baselines are rendered on Windows with Chromium; fonts differ on other operating systems, so regenerate them there before running on another OS.
