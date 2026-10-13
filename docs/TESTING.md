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
   - `E2E_BASE_URL` (default `http://localhost:4200`; must be localhost, not 127.0.0.1, for CORS)
   - `SCREENS_LABEL` (default `current`), `SCREENS_DIR` (default `./screens-output`)
4. Output: `screens-output/<label>/<mobile|desktop>/<route>-<dark|light>.png` (gitignored),
   plus `onboarding-*` and a logged-out `login-*`. The login state is stored in `e2e/.auth/` (gitignored).
5. After the restyle run again with another label and list differences:
   `npm run e2e:screens:compare -- before after` (byte comparison).

Without `E2E_USER`/`E2E_PASSWORD` the login step and all logged-in screens are skipped.
Chromium runs with `--disable-web-security` here only, because the local API's CORS allows
just `http://localhost:4200` and `:4300`. Inner scroll containers are handled by enlarging the
viewport to the content height (capped at 8000 px).
