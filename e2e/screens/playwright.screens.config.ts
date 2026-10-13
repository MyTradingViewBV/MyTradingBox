import { defineConfig, devices } from '@playwright/test';
import { isLocalUrl } from './shared.screens';

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';
if (!isLocalUrl(baseURL)) {
  throw new Error(
    `Refusing to run: E2E_BASE_URL "${baseURL}" is not a localhost / 127.0.0.1 URL. ` +
      'The screen tools log in with real credentials and must only target a local dev server.',
  );
}

/**
 * Screenshot capture (before/after restyle comparison). NOT part of `npm run e2e`:
 * the files here are named *.screens.ts, which the default config does not match.
 *
 * Runs against an already running dev server (no webServer) wired to the LOCAL API.
 * See docs/TESTING.md ("Screen captures").
 *
 * Projects: `capture` (before/after screenshots), `snapshots` (toHaveScreenshot regression
 * tests, e2e/screens/snapshots.screens.ts). `npm run e2e:screens` runs capture only,
 * `npm run e2e:snapshots` runs snapshots only.
 *
 * Env: E2E_USER, E2E_PASSWORD (required), E2E_BASE_URL (default http://localhost:4200, must be localhost/127.0.0.1),
 *      SCREENS_LABEL (default 'current'), SCREENS_DIR (default ./screens-output).
 *
 * Chromium runs with --disable-web-security because the local API's CORS only allows
 * http://localhost:4200/4300; this is for screen capture only.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.screens\.ts$/,
  fullyParallel: false,
  workers: 2,
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  outputDir: '../../test-results/screens',
  // One platform-independent folder; baselines are committed (see docs/TESTING.md).
  snapshotPathTemplate: '{testDir}/__snapshots__/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    launchOptions: { args: ['--disable-web-security'] },
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.screens\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'snapshots',
      testMatch: /snapshots\.screens\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'capture',
      testMatch: /capture\.screens\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
