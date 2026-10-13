import { expect, test } from './fixtures';

test.describe('logged-out user', () => {
  test('is redirected from a guarded page to /login', async ({ page }) => {
    await page.goto('/orders');

    await expect(page).toHaveURL(/\/login$/);
  });

  test('sees the login providers', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('button', { name: 'Continue with Apple' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  });

  test('cannot submit the login form with an invalid email', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with Google' }).click();

    await page.getByLabel('Email').fill('not-an-email');
    await page.locator('#passwordInput').fill('secret');

    await expect(page.getByText('Invalid email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
  });
});

test.describe('first-time user', () => {
  test.use({ onboardingDone: false });

  test('sees the onboarding', async ({ page }) => {
    await page.goto('/login');

    await expect(
      page.getByRole('heading', { name: 'Welcome to MyTradingBox', level: 2 }),
    ).toBeVisible();
  });
});
