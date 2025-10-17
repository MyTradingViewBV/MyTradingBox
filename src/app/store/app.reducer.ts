import { createFeature, createReducer, on } from '@ngrx/store';
import { AppActions } from './app.actions';
import { LoginResponse } from '../modules/shared/models/LoginResponse.dto';
import { Exchange } from '../modules/shared/models/TradeOrders.dto';
import { SymbolModel } from '../modules/shared/http/market.service';

export interface AppState {
  token: LoginResponse | null;
  currency: string | null;
  exchange: Exchange | null;
  symbol: SymbolModel | null;
}

export const initialState: AppState = {
  token: null,
  currency: null,
  exchange: null,
  symbol: null
};

export const appFeature = createFeature({
  name: 'appState',
  reducer: createReducer(
    initialState,
    on(AppActions.clear, () => initialState),
    on(AppActions.setSelectedCurrency, (state, { currency }) => ({
      ...state,
      currency,
    })),
    on(AppActions.setSelectedExchange, (state, { exchange }) => ({
      ...state,
      exchange,
    })),
     on(AppActions.setSelectedSymbol, (state, { symbol }) => ({
      ...state,
      symbol,
    })),
    on(AppActions.setToken, (state, { token }) => ({
      ...state,
      token,
    })),
  ),
});
