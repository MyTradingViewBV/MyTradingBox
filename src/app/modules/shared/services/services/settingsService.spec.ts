import { TestBed } from '@angular/core/testing';
import { Store, provideStore } from '@ngrx/store';
import { Observable, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppActions } from 'src/app/store/app/app.actions';
import { appFeature } from 'src/app/store/app/app.reducer';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { rootMetaReducers, rootReducers } from 'src/app/store/root.store';
import { LEGACY_KEYS, PERSISTED_KEYS } from 'src/app/store/persistence/state-persistence.meta-reducer';
import { Exchange } from '../../models/orders/exchange.dto';
import { SymbolModel } from '../../models/chart/symbol.dto';
import { SettingsService } from './settingsService';

function exchange(Id: number, Name: string): Exchange {
  return Object.assign(new Exchange(), { Id, Name });
}

function symbol(SymbolName: string): SymbolModel {
  return Object.assign(new SymbolModel(), { SymbolName });
}

/** Collects every emission of an observable (store selectors emit synchronously). */
function record<T>(source: Observable<T>): T[] {
  const values: T[] = [];
  source.subscribe((v) => values.push(v));
  return values;
}

describe('SettingsService', () => {
  function setup(): { service: SettingsService; store: Store } {
    TestBed.configureTestingModule({
      providers: [provideStore(rootReducers, { metaReducers: rootMetaReducers })],
    });
    return { service: TestBed.inject(SettingsService), store: TestBed.inject(Store) };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  describe('selected exchange', () => {
    it('falls back to exchange id 1 until an exchange is selected', async () => {
      const { service } = setup();

      expect(await firstValueFrom(service.getSelectedExchange())).toBeNull();
      expect(await firstValueFrom(service.getExchangeId$())).toBe(1);
    });

    it('waitForExchangeId$ emits once, only after an exchange is resolved', () => {
      const { service } = setup();
      const ids = record(service.waitForExchangeId$());
      expect(ids).toEqual([]);

      service.setSelectedExchange(exchange(7, 'Bybit'));
      service.setSelectedExchange(exchange(8, 'Kraken'));

      expect(ids).toEqual([7]);
    });

    it('does not re-emit for an equal exchange object, but does for a different one', () => {
      const { service } = setup();
      const seen = record(service.getSelectedExchange());

      service.setSelectedExchange(exchange(2, 'Kraken'));
      service.setSelectedExchange(exchange(2, 'Kraken'));
      service.setSelectedExchange(exchange(3, 'Kraken'));

      expect(seen.map((e) => e?.Id ?? null)).toEqual([null, 2, 3]);
    });

    it('drops the persisted exchange when settings are cleared', async () => {
      const { service } = setup();
      service.setSelectedExchange(exchange(2, 'Kraken'));

      service.dispatchAppAction(SettingsActions.clear());

      expect(await firstValueFrom(service.getExchangeId$())).toBe(1);
      expect(localStorage.getItem(PERSISTED_KEYS.exchange)).toBeNull();
    });

    it('hydrates an exchange stored with only a name', async () => {
      localStorage.setItem(PERSISTED_KEYS.exchange, JSON.stringify({ Name: '  Binance ' }));
      const { service } = setup();

      expect(await firstValueFrom(service.getSelectedExchange())).toEqual(
        expect.objectContaining({ Id: 0, Name: 'Binance' }),
      );
    });
  });

  describe('dark mode', () => {
    it('defaults to dark and persists a change', async () => {
      const { service } = setup();
      expect(await firstValueFrom(service.getDarkModeEnabled())).toBe(true);

      service.dispatchAppAction(SettingsActions.setDarkModeEnabled({ enabled: false }));

      expect(await firstValueFrom(service.getDarkModeEnabled())).toBe(false);
      expect(localStorage.getItem(PERSISTED_KEYS.darkMode)).toBe('false');
    });

    it('restores a stored light-mode choice', async () => {
      localStorage.setItem(PERSISTED_KEYS.darkMode, 'false');
      const { service } = setup();

      expect(await firstValueFrom(service.getDarkModeEnabled())).toBe(false);
    });

    it('migrates a legacy light theme chosen after the one-time dark default', async () => {
      localStorage.setItem(LEGACY_KEYS.darkModeDefaultMigrated, '1');
      localStorage.setItem(LEGACY_KEYS.theme, 'light');
      const { service } = setup();

      expect(await firstValueFrom(service.getDarkModeEnabled())).toBe(false);
      expect(localStorage.getItem(PERSISTED_KEYS.darkMode)).toBe('false');
    });
  });

  describe('onboarding', () => {
    it('is not completed by default and persists completion and reset', async () => {
      const { service, store } = setup();
      expect(await firstValueFrom(service.getOnboardingCompleted())).toBe(false);

      store.dispatch(AppActions.completeOnboarding());
      expect(await firstValueFrom(service.getOnboardingCompleted())).toBe(true);
      expect(localStorage.getItem(PERSISTED_KEYS.onboarding)).toBe('true');

      store.dispatch(AppActions.resetOnboarding());
      expect(await firstValueFrom(service.getOnboardingCompleted())).toBe(false);
      expect(localStorage.getItem(PERSISTED_KEYS.onboarding)).toBeNull();
    });

    it('restores completion from storage, including the legacy flag', async () => {
      localStorage.setItem(LEGACY_KEYS.onboarding, '1');
      const { service } = setup();

      expect(await firstValueFrom(service.getOnboardingCompleted())).toBe(true);
      expect(localStorage.getItem(LEGACY_KEYS.onboarding)).toBeNull();
    });
  });

  describe('language (app state)', () => {
    it('defaults to Dutch and follows setLanguage', async () => {
      const { store } = setup();
      expect(await firstValueFrom(store.select(appFeature.selectLanguage))).toBe('nl');

      store.dispatch(AppActions.setLanguage({ language: 'en' }));

      expect(await firstValueFrom(store.select(appFeature.selectLanguage))).toBe('en');
    });
  });

  describe('symbols', () => {
    it('does not re-emit when the selected symbol only differs in case', () => {
      const { service } = setup();
      const seen = record(service.getSelectedSymbol());

      service.dispatchAppAction(SettingsActions.setSelectedSymbol({ symbol: symbol('BTCUSDT') }));
      service.dispatchAppAction(SettingsActions.setSelectedSymbol({ symbol: symbol('btcusdt') }));
      service.dispatchAppAction(SettingsActions.setSelectedSymbol({ symbol: symbol('ETHUSDT') }));

      expect(seen.map((s) => s?.SymbolName ?? null)).toEqual([null, 'BTCUSDT', 'ETHUSDT']);
    });

    it('marks the favorite symbol in the symbol list', async () => {
      const { service } = setup();
      service.dispatchAppAction(
        SettingsActions.setSymbolsList({ symbols: [symbol('BTCUSDT'), symbol('ETHUSDT')] }),
      );
      service.dispatchAppAction(SettingsActions.setFavoriteSymbolName({ symbolName: 'ETHUSDT' }));

      expect(await firstValueFrom(service.getFavoriteSymbolName())).toBe('ETHUSDT');
      expect((await firstValueFrom(service.getSymbolsList())).map((s) => s.isFavorite)).toEqual([
        false,
        true,
      ]);
    });
  });

  describe('other preferences', () => {
    it('exposes defaults for alerts, admin mode, UI mode, timeframe, currency and test orders', async () => {
      const { service } = setup();

      expect(await firstValueFrom(service.getTradeAlertsEnabled())).toBe(true);
      expect(await firstValueFrom(service.getPriceAlertsEnabled())).toBe(true);
      expect(await firstValueFrom(service.getNewsUpdatesEnabled())).toBe(false);
      expect(await firstValueFrom(service.getAdminModeEnabled())).toBe(false);
      expect(await firstValueFrom(service.getUiModeOverride())).toBe('auto');
      expect(await firstValueFrom(service.getSelectedTimeframe())).toBeNull();
      expect(await firstValueFrom(service.getSelectedCurrency())).toBeNull();
      expect(await firstValueFrom(service.getWebTestOrders())).toEqual([]);
    });

    it('reflects updated preferences', async () => {
      const { service } = setup();
      service.dispatchAppAction(SettingsActions.setUiModeOverride({ mode: 'mobile' }));
      service.dispatchAppAction(SettingsActions.setSelectedTimeframe({ timeframe: '4h' }));
      service.dispatchAppAction(SettingsActions.setAdminModeEnabled({ enabled: true }));

      expect(await firstValueFrom(service.getUiModeOverride())).toBe('mobile');
      expect(await firstValueFrom(service.getSelectedTimeframe())).toBe('4h');
      expect(await firstValueFrom(service.getAdminModeEnabled())).toBe(true);
      expect((await firstValueFrom(service.getAppState())).timeframe).toBe('4h');
    });
  });
});
