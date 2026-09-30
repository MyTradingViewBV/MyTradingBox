import { TestBed } from '@angular/core/testing';
import { Store, provideStore } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { rootMetaReducers, rootReducers } from '../root.store';
import { AppActions } from '../app/app.actions';
import { appFeature } from '../app/app.reducer';
import { SettingsActions } from '../settings/settings.actions';
import { settingsFeature } from '../settings/settings.reducer';
import { LEGACY_KEYS, PERSISTED_KEYS, migrateLegacyStorage } from './state-persistence.meta-reducer';

describe('statePersistenceMetaReducer', () => {
  function createStore(): Store {
    TestBed.configureTestingModule({
      providers: [provideStore(rootReducers, { metaReducers: rootMetaReducers })],
    });
    return TestBed.inject(Store);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('prefers an existing versioned key over a legacy value and still removes the legacy key', async () => {
    localStorage.setItem(PERSISTED_KEYS.darkMode, 'true');
    localStorage.setItem(LEGACY_KEYS.darkModeDefaultMigrated, '1');
    localStorage.setItem(LEGACY_KEYS.theme, 'light');

    const store = createStore();

    expect(
      await firstValueFrom(store.select(settingsFeature.selectDarkModeEnabled)),
    ).toBe(true);
    expect(localStorage.getItem(LEGACY_KEYS.theme)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEYS.darkModeDefaultMigrated)).toBeNull();
  });

  it('writes dark mode back when it changes', () => {
    const store = createStore();

    store.dispatch(SettingsActions.setDarkModeEnabled({ enabled: false }));

    expect(localStorage.getItem(PERSISTED_KEYS.darkMode)).toBe('false');
  });

  describe('language', () => {
    it('writes the chosen language and hydrates it on the next start', async () => {
      createStore().dispatch(AppActions.setLanguage({ language: 'en' }));
      expect(localStorage.getItem(PERSISTED_KEYS.language)).toBe('"en"');

      TestBed.resetTestingModule();
      const store = createStore();

      expect(await firstValueFrom(store.select(appFeature.selectLanguage))).toBe('en');
    });

    it('keeps the language when the session is cleared', async () => {
      const store = createStore();
      store.dispatch(AppActions.setLanguage({ language: 'en' }));

      store.dispatch(AppActions.clear());

      expect(await firstValueFrom(store.select(appFeature.selectLanguage))).toBe('en');
      expect(localStorage.getItem(PERSISTED_KEYS.language)).toBe('"en"');
    });

    it('discards an unsupported stored language and falls back to the default', async () => {
      localStorage.setItem(PERSISTED_KEYS.language, '"de"');

      const store = createStore();

      expect(await firstValueFrom(store.select(appFeature.selectLanguage))).toBe('nl');
      expect(localStorage.getItem(PERSISTED_KEYS.language)).toBeNull();
    });
  });

  it('keeps onboarding completion when the session is cleared', async () => {
    const store = createStore();

    store.dispatch(AppActions.completeOnboarding());
    store.dispatch(AppActions.clear());

    expect(
      await firstValueFrom(store.select(appFeature.selectOnboardingDone)),
    ).toBe(true);
    expect(localStorage.getItem(PERSISTED_KEYS.onboarding)).toBe('true');

    store.dispatch(AppActions.resetOnboarding());
    expect(localStorage.getItem(PERSISTED_KEYS.onboarding)).toBeNull();
  });

  it('ignores a stored value of the wrong type', async () => {
    localStorage.setItem(PERSISTED_KEYS.onboarding, '"yes"');

    const store = createStore();

    expect(
      await firstValueFrom(store.select(appFeature.selectOnboardingDone)),
    ).toBe(false);
    expect(localStorage.getItem(PERSISTED_KEYS.onboarding)).toBeNull();
  });

  describe('legacy migration', () => {
    const darkMode$ = (store: Store) =>
      firstValueFrom(store.select(settingsFeature.selectDarkModeEnabled));

    it('migrates the legacy auth session only when the versioned key is absent', () => {
      localStorage.setItem(LEGACY_KEYS.auth, '{"AccessToken":"legacy"}');

      migrateLegacyStorage(localStorage);

      expect(localStorage.getItem(PERSISTED_KEYS.auth)).toBe('{"AccessToken":"legacy"}');
      expect(localStorage.getItem(LEGACY_KEYS.auth)).toBeNull();
    });

    it('drops a legacy onboarding flag that is not "1"', () => {
      localStorage.setItem(LEGACY_KEYS.onboarding, '0');

      migrateLegacyStorage(localStorage);

      expect(localStorage.getItem(PERSISTED_KEYS.onboarding)).toBeNull();
      expect(localStorage.getItem(LEGACY_KEYS.onboarding)).toBeNull();
    });

    it.each([
      ['a legacy dark theme', { [LEGACY_KEYS.theme]: 'dark' }, true],
      ['only the one-time dark default flag', { [LEGACY_KEYS.darkModeDefaultMigrated]: '1' }, true],
      [
        'a light theme chosen after the dark default',
        { [LEGACY_KEYS.theme]: 'light', [LEGACY_KEYS.darkModeDefaultMigrated]: '1' },
        false,
      ],
      // Without the flag the old app had not applied its dark default yet.
      ['a light theme from before the dark default', { [LEGACY_KEYS.theme]: 'light' }, true],
    ])('maps %s to darkMode=%s', async (_, legacy, dark) => {
      Object.entries(legacy).forEach(([key, value]) => localStorage.setItem(key, value));

      const store = createStore();

      expect(await darkMode$(store)).toBe(dark);
      expect(localStorage.getItem(PERSISTED_KEYS.darkMode)).toBe(JSON.stringify(dark));
      expect(localStorage.getItem(LEGACY_KEYS.theme)).toBeNull();
      expect(localStorage.getItem(LEGACY_KEYS.darkModeDefaultMigrated)).toBeNull();
    });

    it('does not write a dark-mode preference when there is nothing to migrate', () => {
      createStore();

      expect(localStorage.getItem(PERSISTED_KEYS.darkMode)).toBeNull();
    });

    it('removes state of the old localStorage reducer and obsolete keys, keeping unrelated keys', () => {
      ['appState', 'settingsState_exchange', 'keyZonesState_BTC', 'mtb_version'].forEach((key) =>
        localStorage.setItem(key, 'x'),
      );
      localStorage.setItem('appStateless', 'keep');
      localStorage.setItem('other.key', 'keep');

      migrateLegacyStorage(localStorage);

      expect(Object.keys(localStorage).sort()).toEqual(['appStateless', 'other.key']);
    });
  });

  describe('corrupted or invalid stored values', () => {
    it.each([
      ['malformed JSON', '{"AccessToken":'],
      ['a missing access token', '{"ExpiresIn":""}'],
      ['a blank access token', '{"AccessToken":"   "}'],
      ['a non-string access token', '{"AccessToken":42}'],
      ['JSON null', 'null'],
    ])('discards an auth entry with %s', async (_, raw) => {
      localStorage.setItem(PERSISTED_KEYS.auth, raw);

      const store = createStore();

      expect(await firstValueFrom(store.select(appFeature.selectToken))).toBeNull();
      expect(localStorage.getItem(PERSISTED_KEYS.auth)).toBeNull();
    });

    it.each([
      ['malformed JSON', '{Id:'],
      ['neither id nor name', '{"Id":"2","Name":"  "}'],
      ['JSON null', 'null'],
    ])('discards an exchange entry with %s', async (_, raw) => {
      localStorage.setItem(PERSISTED_KEYS.exchange, raw);

      const store = createStore();

      expect(await firstValueFrom(store.select(settingsFeature.selectExchange))).toBeNull();
      expect(localStorage.getItem(PERSISTED_KEYS.exchange)).toBeNull();
    });

    it('discards a corrupted dark-mode entry and keeps the default', async () => {
      localStorage.setItem(PERSISTED_KEYS.darkMode, 'tru');

      const store = createStore();

      expect(await firstValueFrom(store.select(settingsFeature.selectDarkModeEnabled))).toBe(true);
      expect(localStorage.getItem(PERSISTED_KEYS.darkMode)).toBeNull();
    });
  });

  describe('storage failures', () => {
    it('starts with defaults when reading storage throws', async () => {
      localStorage.setItem(PERSISTED_KEYS.darkMode, 'false');
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      const store = createStore();

      expect(await firstValueFrom(store.select(settingsFeature.selectDarkModeEnabled))).toBe(true);
    });

    it('keeps working when removing or enumerating keys throws', async () => {
      localStorage.setItem(PERSISTED_KEYS.darkMode, '"bad"');
      localStorage.setItem('appState', 'x');
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      const store = createStore();
      store.dispatch(AppActions.clear());

      expect(await firstValueFrom(store.select(settingsFeature.selectDarkModeEnabled))).toBe(true);
    });

    it('keeps the in-memory state when writing throws', async () => {
      const store = createStore();
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      store.dispatch(SettingsActions.setDarkModeEnabled({ enabled: false }));
      store.dispatch(AppActions.completeOnboarding());

      expect(await firstValueFrom(store.select(settingsFeature.selectDarkModeEnabled))).toBe(false);
      expect(await firstValueFrom(store.select(appFeature.selectOnboardingDone))).toBe(true);
    });

    it('runs without persistence when localStorage itself is inaccessible', async () => {
      vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      const store = createStore();
      store.dispatch(SettingsActions.setDarkModeEnabled({ enabled: false }));

      expect(await firstValueFrom(store.select(settingsFeature.selectDarkModeEnabled))).toBe(false);
      vi.restoreAllMocks();
      expect(localStorage.getItem(PERSISTED_KEYS.darkMode)).toBeNull();
    });
  });

  describe('write-back', () => {
    it('only writes slices whose reference changed', () => {
      const store = createStore();
      const setItem = vi.spyOn(Storage.prototype, 'setItem');

      store.dispatch(SettingsActions.setSelectedTimeframe({ timeframe: '4h' }));

      expect(setItem).not.toHaveBeenCalled();
    });

    it('stores only id and name of the selected exchange', () => {
      const store = createStore();

      store.dispatch(
        SettingsActions.setSelectedExchange({
          exchange: Object.assign(new Exchange(), { Id: 2, Name: 'Kraken', Status: 'Online' }),
        }),
      );

      expect(localStorage.getItem(PERSISTED_KEYS.exchange)).toBe('{"Id":2,"Name":"Kraken"}');
    });
  });
});
