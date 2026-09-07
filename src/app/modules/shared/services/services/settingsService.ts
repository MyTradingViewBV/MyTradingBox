import { Action, Store } from '@ngrx/store';
import { Observable, map, distinctUntilChanged, filter, take } from 'rxjs';
import {
  SettingsState,
  settingsFeature,
  UiModeOverride,
} from 'src/app/store/settings/settings.reducer';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { WebTestOrder } from '../../models/orders/web-test-order.model';
import { SymbolModel } from '../../models/chart/symbol.dto';
import { Exchange } from '../../models/orders/exchange.dto';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  static readonly selectedExchangeStorageKey = 'mtb.selected-exchange.v1';

  private readonly _settingsStore = inject(Store<SettingsState>);

  constructor() {
    this.restoreSelectedExchange();
  }

  dispatchAppAction(action: Action): void {
    this._settingsStore.dispatch(action);
  }

  setSelectedExchange(exchange: Exchange): void {
    this._settingsStore.dispatch(
      SettingsActions.setSelectedExchange({ exchange }),
    );

    try {
      localStorage.setItem(
        SettingsService.selectedExchangeStorageKey,
        JSON.stringify({ Id: exchange.Id, Name: exchange.Name }),
      );
    } catch {
      // Storage can be unavailable in private browsing; the in-memory selection still applies.
    }
  }

  clearSelectedExchangePreference(): void {
    try {
      localStorage.removeItem(SettingsService.selectedExchangeStorageKey);
    } catch {
      // Storage can be unavailable in private browsing.
    }
  }

  getAppState(): Observable<SettingsState> {
    return this._settingsStore.select(settingsFeature.selectSettingsStateState);
  }

  getExchangeId$(): Observable<number> {
    return this.getSelectedExchange().pipe(map((ex) => ex?.Id ?? 1));
  }

  /**
   * Waits until the exchange is actually resolved in the store (non-null)
   * before emitting the exchange Id. Use this for one-shot HTTP calls that
   * must NOT fire with the null-fallback default (Id=1) that is present
   * before the exchange loading chain completes.
   */
  waitForExchangeId$(): Observable<number> {
    return this.getSelectedExchange().pipe(
      filter((ex): ex is Exchange => ex !== null),
      take(1),
      map((ex) => ex.Id),
    );
  }

  getSelectedExchange(): Observable<Exchange | null> {
    return this._settingsStore.select(settingsFeature.selectExchange).pipe(
      distinctUntilChanged((a, b) => {
        if (a === b) return true;
        if (!a || !b) return false;
        return a.Id === b.Id && a.Name === b.Name;
      }),
    );
  }

  getSelectedCurrency(): Observable<string | null> {
    return new Observable<string | null>((sub) => {
      sub.next(null);
      sub.complete();
    });
  }

  getSelectedTimeframe(): Observable<string | null> {
    return this._settingsStore.select(settingsFeature.selectTimeframe);
  }

  getSelectedSymbol(): Observable<SymbolModel | null> {
    return this._settingsStore.select(settingsFeature.selectSymbol).pipe(
      distinctUntilChanged((a, b) => {
        if (a === b) return true;
        if (!a || !b) return false;
        return (
          (a.SymbolName || '').toUpperCase() ===
          (b.SymbolName || '').toUpperCase()
        );
      }),
    );
  }

  getSymbolsList(): Observable<SymbolModel[]> {
    return this._settingsStore.select((s) => s.symbols);
  }

  getFavoriteSymbolName(): Observable<string | null> {
    return this._settingsStore.select((s) => s.favoriteSymbolName);
  }

  getTradeAlertsEnabled(): Observable<boolean | undefined> {
    return this._settingsStore.select(settingsFeature.selectTradeAlertsEnabled);
  }
  getPriceAlertsEnabled(): Observable<boolean | undefined> {
    return this._settingsStore.select(settingsFeature.selectPriceAlertsEnabled);
  }
  getNewsUpdatesEnabled(): Observable<boolean | undefined> {
    return this._settingsStore.select(settingsFeature.selectNewsUpdatesEnabled);
  }
  getDarkModeEnabled(): Observable<boolean | undefined> {
    return this._settingsStore.select(settingsFeature.selectDarkModeEnabled);
  }

  getOnboardingCompleted(): Observable<boolean | undefined> {
    return this._settingsStore.select(
      settingsFeature.selectOnboardingCompleted,
    );
  }

  getAdminModeEnabled(): Observable<boolean | undefined> {
    return this._settingsStore.select(settingsFeature.selectAdminModeEnabled);
  }

  getUiModeOverride(): Observable<UiModeOverride> {
    return this._settingsStore.select(settingsFeature.selectUiModeOverride);
  }

  getWebTestOrders(): Observable<WebTestOrder[]> {
    return this._settingsStore.select(settingsFeature.selectWebTestOrders);
  }

  private restoreSelectedExchange(): void {
    let storedValue: string | null;

    try {
      storedValue = localStorage.getItem(
        SettingsService.selectedExchangeStorageKey,
      );
    } catch {
      return;
    }

    if (!storedValue) return;

    try {
      const storedExchange = JSON.parse(storedValue) as Partial<Exchange>;
      const hasId =
        typeof storedExchange.Id === 'number' &&
        Number.isFinite(storedExchange.Id);
      const hasName =
        typeof storedExchange.Name === 'string' &&
        storedExchange.Name.trim().length > 0;

      if (!hasId && !hasName) throw new Error('Invalid exchange preference');

      const exchange = new Exchange();
      if (hasId) exchange.Id = storedExchange.Id as number;
      if (hasName) exchange.Name = (storedExchange.Name as string).trim();

      this._settingsStore.dispatch(
        SettingsActions.setSelectedExchange({ exchange }),
      );
    } catch {
      this.clearSelectedExchangePreference();
    }
  }
}
