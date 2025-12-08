import { Action, Store } from '@ngrx/store';
import { Observable, map, distinctUntilChanged } from 'rxjs';
import {
  SettingsState,
  settingsFeature,
} from 'src/app/store/settings/settings.reducer';
import { SymbolModel } from '../../models/chart/symbol.dto';
import { Exchange } from '../../models/orders/exchange.dto';
import { Injectable } from '@angular/core';


@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  constructor(private _settingsStore: Store<SettingsState>) {}

  dispatchAppAction(action: Action): void {
    this._settingsStore.dispatch(action);
  }

  getAppState(): Observable<SettingsState> {
    return this._settingsStore.select(settingsFeature.selectSettingsStateState);
  }

  getExchangeId$(): Observable<number> {
    return this.getSelectedExchange().pipe(map((ex) => ex?.Id ?? 1));
  }

  getSelectedExchange(): Observable<Exchange | null> {
    return this._settingsStore
      .select(settingsFeature.selectExchange)
      .pipe(
        distinctUntilChanged((a, b) => {
          if (a === b) return true;
          if (!a || !b) return false;
          return a.Id === b.Id && a.Name === b.Name;
        })
      );
  }

  getSelectedCurrency(): Observable<string | null> {
    return this._settingsStore.select(settingsFeature.selectCurrency);
  }

  getSelectedTimeframe(): Observable<string | null> {
    return this._settingsStore.select(settingsFeature.selectTimeframe);
  }

  getSelectedSymbol(): Observable<SymbolModel | null> {
    return this._settingsStore
      .select(settingsFeature.selectSymbol)
      .pipe(
        distinctUntilChanged((a, b) => {
          if (a === b) return true;
          if (!a || !b) return false;
          return (a.SymbolName || '').toUpperCase() === (b.SymbolName || '').toUpperCase();
        })
      );
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
    return this._settingsStore.select(settingsFeature.selectOnboardingCompleted);
  }

  getAdminModeEnabled(): Observable<boolean | undefined> {
    return this._settingsStore.select(settingsFeature.selectAdminModeEnabled);
  }
}
