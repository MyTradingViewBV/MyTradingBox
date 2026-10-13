import { defineConfig, devices } from '@playwright/test';

const port = 4200;
const baseURL = `http://127.0.0.1:${port}`;

/**
 * End-to-end tests (e2e/). Unit tests stay in src/ and run through `ng test`.
 *
 * The dev build talks to the production API, so every e2e test uses the
 * fixture in e2e/fixtures.ts, which blocks or mocks all API traffic.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm start',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
