import { defineConfig, devices } from '@playwright/test';

/**
 * Screenshot capture (before/after restyle comparison). NOT part of `npm run e2e`:
 * the files here are named *.screens.ts, which the default config does not match.
 *
 * Runs against an already running dev server (no webServer) wired to the LOCAL API.
 * See docs/TESTING.md ("Screen captures").
 *
 * Env: E2E_USER, E2E_PASSWORD (required), E2E_BASE_URL (default http://localhost:4200),
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
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4200',
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
      name: 'capture',
      testMatch: /capture\.screens\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
