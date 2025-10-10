import { createFeature, createReducer, on } from '@ngrx/store';
import { AppActions } from './app.actions';
import { LoginResponse } from '../modules/shared/models/LoginResponse.dto';
import { Exchange } from '../modules/shared/models/TradeOrders.dto';

export interface AppState {
  token: LoginResponse | null;
  currency: string | null;
  exchange: Exchange | null;
}

export const initialState: AppState = {
  token: null,
  currency: null,
  exchange: null,
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
    on(AppActions.setToken, (state, { token }) => ({
      ...state,
      token,
    })),
  ),
});
