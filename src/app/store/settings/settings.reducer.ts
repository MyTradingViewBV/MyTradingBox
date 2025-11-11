import { createFeature, createReducer, on } from '@ngrx/store';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { SettingsActions } from './settings.actions';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';

export interface SettingsState {
  currency: string | null;
  exchange: Exchange | null;
  symbol: SymbolModel | null;
}

export const initialState: SettingsState = {
  currency: null,
  exchange: null,
  symbol: null,
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
  ),
});
