import { expect, test as setup } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { AUTH_FILE } from './shared.screens';

setup('log in through the UI and save storage state', async ({ page }) => {
  const user = process.env['E2E_USER'];
  const password = process.env['E2E_PASSWORD'];
  setup.skip(
    !user || !password,
    'E2E_USER / E2E_PASSWORD not set: skipping login; logged-in screens will be skipped',
  );

  page.on('dialog', (dialog) => void dialog.dismiss());
  await page.addInitScript(() => {
    localStorage.setItem('mtb.state.onboarding.v1', 'true');
    localStorage.setItem('mtb.state.language.v1', JSON.stringify('en'));
  });

  await page.goto('/login');
  await page.locator('#usernameInput').fill(user as string);
  await page.locator('#passwordInput').fill(password as string);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  mkdirSync('e2e/.auth', { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
