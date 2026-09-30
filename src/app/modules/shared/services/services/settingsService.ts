import { Action, Store } from '@ngrx/store';
import { Observable, map, distinctUntilChanged, filter, take } from 'rxjs';
import {
  SettingsState,
  settingsFeature,
  UiModeOverride,
} from 'src/app/store/settings/settings.reducer';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { appFeature } from 'src/app/store/app/app.reducer';
import { WebTestOrder } from '../../models/orders/web-test-order.model';
import { SymbolModel } from '../../models/chart/symbol.dto';
import { Exchange } from '../../models/orders/exchange.dto';
import { Injectable, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  // Persistence of the selected exchange is handled by the store's
  // persistence meta-reducer (store/persistence); this service only dispatches.
  private readonly _settingsStore = inject(Store<SettingsState>);

  dispatchAppAction(action: Action): void {
    this._settingsStore.dispatch(action);
  }

  setSelectedExchange(exchange: Exchange): void {
    this._settingsStore.dispatch(
      SettingsActions.setSelectedExchange({ exchange }),
    );
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
    return this._settingsStore.select(settingsFeature.selectSymbols);
  }

  getFavoriteSymbolName(): Observable<string | null> {
    return this._settingsStore.select(settingsFeature.selectFavoriteSymbolName);
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
    return this._settingsStore.select(appFeature.selectOnboardingDone);
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
}
