import { createFeature, createReducer, on } from '@ngrx/store';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { SettingsActions } from './settings.actions';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { WebTestOrder } from 'src/app/modules/shared/models/orders/web-test-order.model';

export type UiModeOverride = 'auto' | 'web' | 'mobile';

export interface SettingsState {
  exchange: Exchange | null;
  timeframe: string | null;
  symbol: SymbolModel | null;
  symbols: SymbolModel[];
  favoriteSymbolName: string | null;
  tradeAlertsEnabled: boolean;
  priceAlertsEnabled: boolean;
  newsUpdatesEnabled: boolean;
  darkModeEnabled: boolean;
  onboardingCompleted: boolean;
  adminModeEnabled: boolean;
  uiModeOverride: UiModeOverride;
  webTestOrders: WebTestOrder[];
}

export const initialState: SettingsState = {
  exchange: null,
  timeframe: null,
  symbol: null,
  symbols: [],
  favoriteSymbolName: null,
  tradeAlertsEnabled: true,
  priceAlertsEnabled: true,
  newsUpdatesEnabled: false,
  darkModeEnabled: true,
  onboardingCompleted: false,
  adminModeEnabled: false,
  uiModeOverride: 'auto',
  webTestOrders: [],
};

export const settingsFeature = createFeature({
  name: 'settingsState',
  reducer: createReducer(
    initialState,
    on(SettingsActions.clear, () => initialState),
    on(SettingsActions.setSelectedExchange, (state, { exchange }) => ({
      ...state,
      exchange,
    })),
    on(SettingsActions.setSelectedTimeframe, (state, { timeframe }) => ({
      ...state,
      timeframe,
    })),
    on(SettingsActions.setSelectedSymbol, (state, { symbol }) => ({
      ...state,
      symbol,
    })),
    on(SettingsActions.setSymbolsList, (state, { symbols }) => ({
      ...state,
      symbols: (symbols || []).map(s => ({ ...s, isFavorite: s.SymbolName === state.favoriteSymbolName })),
    })),
    on(SettingsActions.setFavoriteSymbolName, (state, { symbolName }) => ({
      ...state,
      favoriteSymbolName: symbolName,
      symbols: (state.symbols || []).map(s => ({ ...s, isFavorite: s.SymbolName === symbolName })),
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
    on(SettingsActions.setOnboardingCompleted, (state, { completed }) => ({
      ...state,
      onboardingCompleted: completed,
    })),
    on(SettingsActions.setAdminModeEnabled, (state, { enabled }) => ({
      ...state,
      adminModeEnabled: enabled,
    })),
    on(SettingsActions.setUiModeOverride, (state, { mode }) => ({
      ...state,
      uiModeOverride: mode,
    })),
    on(SettingsActions.setWebTestOrders, (state, { orders }) => ({
      ...state,
      webTestOrders: orders || [],
    })),
  ),
});
