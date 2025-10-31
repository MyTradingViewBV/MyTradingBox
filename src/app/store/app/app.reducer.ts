import { createFeature, createReducer, on } from '@ngrx/store';
import { LoginResponse } from '../../modules/shared/models/login/loginResponse.dto';
import { AppActions } from './app.actions';

export interface AppState {
  token: LoginResponse | null;
}

export const initialState: AppState = {
  token: null
};

export const appFeature = createFeature({
  name: 'appState',
  reducer: createReducer(
    initialState,
    on(AppActions.clear, () => initialState),
    on(AppActions.setToken, (state, { token }) => ({
      ...state,
      token,
    })),
  ),
});
