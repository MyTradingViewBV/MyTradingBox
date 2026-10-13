import { expect, test, type Locator, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { AUTH_FILE, THEMES, VIEWPORTS } from './shared.screens';

/**
 * Visual regression tests (toHaveScreenshot). Run with `npm run e2e:snapshots`;
 * never part of `npm run e2e`. Baselines live in e2e/screens/__snapshots__/.
 * See docs/TESTING.md ("Screenshot regression tests").
 *
 * - /login and the onboarding overlay need no API (API hosts are blocked).
 * - settings and watchlist are logged in against the LOCAL API (E2E_USER / E2E_PASSWORD
 *   through the setup project); dynamic content (prices, versions) is masked.
 */

const BLOCKED_API = [
  /^https:\/\/mytradingbox\.com\//,
  /^https:\/\/localhost:7212\//,
];

async function blockApi(page: Page): Promise<void> {
  for (const host of BLOCKED_API) {
    await page.route(host, (route) =>
      route.fulfill({ status: 503, body: 'API blocked in snapshot tests' }),
    );
  }
}

async function seed(
  page: Page,
  options: { dark: boolean; onboardingDone: boolean },
): Promise<void> {
  await page.addInitScript((o) => {
    if (o.onboardingDone)
      localStorage.setItem('mtb.state.onboarding.v1', 'true');
    localStorage.setItem('mtb.state.language.v1', JSON.stringify('en'));
    localStorage.setItem('mtb.state.dark-mode.v1', JSON.stringify(o.dark));
  }, options);
}

async function settle(page: Page, theme: string): Promise<void> {
  await expect(page.locator('body')).toHaveClass(new RegExp(`${theme}-theme`));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
}

/** The version text (v0.1.215) is build dependent. */
const versionText = (page: Page): Locator =>
  page.locator('.version').or(page.getByText(/^v\d+\.\d+\.\d+$/));

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  for (const theme of THEMES) {
    const dark = theme === 'dark';

    test.describe(`${vpName} ${theme}`, () => {
      test('login (logged out)', async ({ browser, baseURL }) => {
        const context = await browser.newContext({ ...vp, baseURL });
        const page = await context.newPage();
        await blockApi(page);
        await seed(page, { dark, onboardingDone: true });
        await page.goto('/login');
        await expect(page.locator('#usernameInput')).toBeVisible();
        await settle(page, theme);
        await expect(page).toHaveScreenshot(`login-${vpName}-${theme}.png`, {
          mask: [versionText(page)],
        });
        await context.close();
      });

      test('onboarding step 1', async ({ browser, baseURL }) => {
        const context = await browser.newContext({ ...vp, baseURL });
        const page = await context.newPage();
        await blockApi(page);
        await seed(page, { dark, onboardingDone: false });
        await page.goto('/login');
        await expect(
          page.locator('app-onboarding .onboarding-wrapper'),
        ).toBeVisible({ timeout: 15_000 });
        await settle(page, theme);
        await expect(page).toHaveScreenshot(
          `onboarding-${vpName}-${theme}.png`,
          {
            mask: [versionText(page)],
          },
        );
        await context.close();
      });

      for (const route of ['settings', 'watchlist']) {
        test(`${route} (logged in)`, async ({ browser, baseURL }) => {
          test.skip(
            !existsSync(AUTH_FILE),
            'no auth state (E2E_USER / E2E_PASSWORD missing)',
          );
          const context = await browser.newContext({
            ...vp,
            baseURL,
            ignoreHTTPSErrors: true,
            storageState: AUTH_FILE,
          });
          const page = await context.newPage();
          page.on('dialog', (dialog) => void dialog.dismiss());
          await seed(page, { dark, onboardingDone: true });
          await page.goto('/' + route);
          await page
            .waitForLoadState('networkidle', { timeout: 15_000 })
            .catch(() => undefined);
          await settle(page, theme);
          expect(new URL(page.url()).pathname).toBe('/' + route);
          await expect(page).toHaveScreenshot(
            `${route}-${vpName}-${theme}.png`,
            {
              mask: [
                versionText(page),
                page.locator('.tv-quote-stack'),
                page.locator('app-watchlist-progressbar'),
                page.locator('.tv-candle-row'),
              ],
            },
          );
          await context.close();
        });
      }
    });
  }
}
