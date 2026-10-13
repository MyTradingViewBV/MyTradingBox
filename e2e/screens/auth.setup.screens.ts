import { expect, test as setup } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { AUTH_FILE, isLocalUrl } from './shared.screens';

/** apiUrl of the active (non-commented) line in src/environments/environment.ts. */
function configuredApiUrl(): string | undefined {
  const text = readFileSync('src/environments/environment.ts', 'utf8');
  const active = text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  const match = active.match(/apiUrl:\s*['"]([^'"]+)['"]/);
  return match?.[1];
}

setup('log in through the UI and save storage state', async ({ page }) => {
  const user = process.env['E2E_USER'];
  const password = process.env['E2E_PASSWORD'];
  setup.skip(
    !user || !password,
    'E2E_USER / E2E_PASSWORD not set: skipping login; logged-in screens will be skipped',
  );

  // Safety: never type real credentials into a build that talks to a non-local API.
  const apiUrl = configuredApiUrl();
  expect(
    apiUrl && isLocalUrl(apiUrl),
    `Aborting before login: src/environments/environment.ts apiUrl is "${apiUrl}", not a localhost API.`,
  ).toBeTruthy();
  // Second line of defence: abort any non-local POST (the login request) and fail the setup.
  const blocked: string[] = [];
  await page.route('**/*', (route) => {
    const request = route.request();
    if (request.method() === 'POST' && !isLocalUrl(request.url())) {
      blocked.push(request.url());
      return route.abort();
    }
    return route.fallback();
  });

  page.on('dialog', (dialog) => void dialog.dismiss());
  await page.addInitScript(() => {
    localStorage.setItem('mtb.state.onboarding.v1', 'true');
    localStorage.setItem('mtb.state.language.v1', JSON.stringify('en'));
  });

  await page.goto('/login');
  await page.locator('#usernameInput').fill(user as string);
  await page.locator('#passwordInput').fill(password as string);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  try {
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  } finally {
    expect(blocked, 'login must only go to a localhost API').toEqual([]);
  }

  mkdirSync('e2e/.auth', { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
