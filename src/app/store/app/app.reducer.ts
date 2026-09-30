import { createFeature, createReducer, on } from '@ngrx/store';
import { LoginResponse } from '../../modules/shared/models/login/loginResponse.dto';
import { AppActions } from './app.actions';

export interface AppState {
  token: LoginResponse | null;
  onboardingDone: boolean;
  language: string;
}

export const initialState: AppState = {
  token: null,
  onboardingDone: false,
  language: 'nl',
};

export const appFeature = createFeature({
  name: 'appState',
  reducer: createReducer(
    initialState,
    // Clearing the session keeps the device-level onboarding status.
    on(AppActions.clear, (state) => ({
      ...initialState,
      onboardingDone: state.onboardingDone,
    })),
    on(AppActions.setToken, (state, { token }) => ({
      ...state,
      token,
    })),
    on(AppActions.completeOnboarding, (state) => ({
      ...state,
      onboardingDone: true,
    })),
    on(AppActions.resetOnboarding, (state) => ({
      ...state,
      onboardingDone: false,
    })),
    on(AppActions.setLanguage, (state, { language }) => ({
      ...state,
      language,
    })),
  ),
});
