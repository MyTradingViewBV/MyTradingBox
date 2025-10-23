import { Action, Store } from '@ngrx/store';
import { Observable, map } from 'rxjs';
import {
  SettingsState,
  settingsFeature,
} from 'src/app/store/settings/settings.reducer';
import { SymbolModel } from '../../models/chart/symbol.dto';
import { Exchange } from '../../models/orders/exchange.dto';

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
    return this._settingsStore.select(settingsFeature.selectExchange);
  }

  getSelectedCurrency(): Observable<string | null> {
    return this._settingsStore.select(settingsFeature.selectCurrency);
  }

  getSelectedSymbol(): Observable<SymbolModel | null> {
    return this._settingsStore.select(settingsFeature.selectSymbol);
  }
}
