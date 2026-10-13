import { expect, test, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_FILE, ROUTES, THEMES, VIEWPORTS, slug } from './shared.screens';

const label = process.env['SCREENS_LABEL'] ?? 'current';
const outRoot = process.env['SCREENS_DIR'] ?? 'screens-output';
const MAX_HEIGHT = 8000;

/** Pages scroll inside inner containers: grow the viewport by the largest hidden scroll amount. */
async function extraScrollHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    let extra = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    for (const el of Array.from(
      document.querySelectorAll<HTMLElement>('body *'),
    )) {
      const style = getComputedStyle(el);
      if (
        !/(auto|scroll|hidden)/.test(style.overflowY) ||
        style.display === 'none'
      )
        continue;
      if (el.clientHeight < 50) continue;
      extra = Math.max(extra, el.scrollHeight - el.clientHeight);
    }
    return extra;
  });
}

async function settle(page: Page, slow: boolean): Promise<void> {
  await page
    .waitForLoadState('networkidle', { timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForTimeout(slow ? 6000 : 2000);
}

async function shoot(
  page: Page,
  file: string,
  slow: boolean,
  baseHeight: number,
): Promise<void> {
  const extra = await extraScrollHeight(page);
  if (extra > 4) {
    await page.setViewportSize({
      width: page.viewportSize()?.width ?? 1440,
      height: Math.min(MAX_HEIGHT, baseHeight + extra),
    });
    await page.waitForTimeout(slow ? 3000 : 1000);
  }
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
}

for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
  for (const theme of THEMES) {
    test.describe(`${vpName} ${theme}`, () => {
      for (const route of ROUTES) {
        const name = slug(route.path);

        test(`${name}`, async ({ browser, baseURL }) => {
          test.skip(
            route.auth && !existsSync(AUTH_FILE),
            'no auth state (E2E_USER / E2E_PASSWORD missing)',
          );
          const context = await browser.newContext({
            ...vp,
            baseURL,
            ignoreHTTPSErrors: true,
            storageState: route.auth ? AUTH_FILE : undefined,
          });
          const page = await context.newPage();
          page.on('dialog', (dialog) => void dialog.dismiss());
          await page.addInitScript(
            ({ dark }) => {
              localStorage.setItem('mtb.state.onboarding.v1', 'true');
              localStorage.setItem(
                'mtb.state.language.v1',
                JSON.stringify('en'),
              );
              localStorage.setItem(
                'mtb.state.dark-mode.v1',
                JSON.stringify(dark),
              );
            },
            { dark: theme === 'dark' },
          );

          await page.goto('/' + route.path);
          await settle(page, !!route.slow);
          await expect(page.locator('body')).toHaveClass(
            new RegExp(`${theme}-theme`),
          );

          const finalPath = new URL(page.url()).pathname;
          if (finalPath !== '/' + route.path) {
            console.log(
              `REDIRECT /${route.path} -> ${finalPath} (${vpName} ${theme})`,
            );
          }
          const file = join(outRoot, label, vpName, `${name}-${theme}.png`);
          await shoot(page, file, !!route.slow, vp.viewport.height);
          await context.close();
        });
      }

      // Onboarding overlay: fresh state, onboarding not done.
      test('onboarding', async ({ browser, baseURL }) => {
        const context = await browser.newContext({
          ...vp,
          baseURL,
          ignoreHTTPSErrors: true,
        });
        const page = await context.newPage();
        await page.addInitScript(
          ({ dark }) => {
            localStorage.setItem('mtb.state.language.v1', JSON.stringify('en'));
            localStorage.setItem(
              'mtb.state.dark-mode.v1',
              JSON.stringify(dark),
            );
          },
          { dark: theme === 'dark' },
        );
        await page.goto('/login');
        await expect(
          page.locator('app-onboarding .onboarding-wrapper'),
        ).toBeVisible({
          timeout: 15_000,
        });
        await page.waitForTimeout(1500);
        await shoot(
          page,
          join(outRoot, label, vpName, `onboarding-${theme}.png`),
          false,
          vp.viewport.height,
        );
        await context.close();
      });
    });
  }
}
