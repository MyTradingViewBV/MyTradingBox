import { createFeature, createReducer, on } from '@ngrx/store';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { SettingsActions } from './settings.actions';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';

export interface SettingsState {
  currency: string | null;
  exchange: Exchange | null;
  symbol: SymbolModel | null;
  tradeAlertsEnabled: boolean;
  priceAlertsEnabled: boolean;
  newsUpdatesEnabled: boolean;
  darkModeEnabled: boolean;
}

export const initialState: SettingsState = {
  currency: null,
  exchange: null,
  symbol: null,
  tradeAlertsEnabled: true,
  priceAlertsEnabled: true,
  newsUpdatesEnabled: false,
  darkModeEnabled: true,
};

export const settingsFeature = createFeature({
  name: 'settingsState',
  reducer: createReducer(
    initialState,
    on(SettingsActions.clear, () => initialState),
    on(SettingsActions.setSelectedCurrency, (state, { currency }) => ({
      ...state,
      currency,
    })),
    on(SettingsActions.setSelectedExchange, (state, { exchange }) => ({
      ...state,
      exchange,
    })),
    on(SettingsActions.setSelectedSymbol, (state, { symbol }) => ({
      ...state,
      symbol,
    })),
    on(SettingsActions.setTradeAlertsEnabled, (state, { enabled }) => ({
      ...state,
      tradeAlertsEnabled: enabled,
    })),
    on(SettingsActions.setPriceAlertsEnabled, (state, { enabled }) => ({
      ...state,
      priceAlertsEnabled: enabled,
    })),
    on(SettingsActions.setNewsUpdatesEnabled, (state, { enabled }) => ({
      ...state,
      newsUpdatesEnabled: enabled,
    })),
    on(SettingsActions.setDarkModeEnabled, (state, { enabled }) => ({
      ...state,
      darkModeEnabled: enabled,
    })),
  ),
});
