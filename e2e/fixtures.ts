import { test as base, expect } from '@playwright/test';

/** Persisted-state keys, mirrored from src/app/store/persistence/state-persistence.meta-reducer.ts. */
export const STORAGE_KEYS = {
  onboarding: 'mtb.state.onboarding.v1',
  language: 'mtb.state.language.v1',
} as const;

const API_HOST = /^https:\/\/mytradingbox\.com\//;

interface E2eOptions {
  /** Pretend the user already finished onboarding (default true). */
  onboardingDone: boolean;
  /** UI language persisted before the app boots (default 'en'). */
  language: 'en' | 'nl';
}

/**
 * Base test for all e2e specs:
 *  - blocks every call to the real API, so tests never touch production;
 *    a test that needs data registers its own `page.route` mock first;
 *  - seeds localStorage before the app boots.
 */
export const test = base.extend<E2eOptions>({
  onboardingDone: [true, { option: true }],
  language: ['en', { option: true }],

  page: async ({ page, onboardingDone, language }, use) => {
    await page.route(API_HOST, (route) =>
      route.fulfill({ status: 503, body: 'API blocked in e2e tests' }),
    );

    await page.addInitScript(
      ({ keys, onboardingDone, language }) => {
        if (onboardingDone) {
          localStorage.setItem(keys.onboarding, 'true');
        }
        localStorage.setItem(keys.language, JSON.stringify(language));
      },
      { keys: STORAGE_KEYS, onboardingDone, language },
    );

    await use(page);
  },
});

export { expect };
