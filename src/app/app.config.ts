import { localStorageSync } from 'ngrx-store-localstorage';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { TokenInterceptor } from './modules/shared/auth/interceptors/token.interceptor';
import { ErrorInterceptor } from './modules/shared/auth/interceptors/error.interceptor';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import {
  TranslateHttpLoader,
  TRANSLATE_HTTP_LOADER_CONFIG,
} from '@ngx-translate/http-loader';
import { ServiceWorkerModule } from '@angular/service-worker';
import { ArcElement, Chart, PieController } from 'chart.js';

// Register chart.js elements (do this outside providers)
Chart.register(PieController, ArcElement);

// MetaReducers with localStorageSync
import {
  ActionReducer,
  ActionReducerMap,
  MetaReducer,
  provideStore,
} from '@ngrx/store';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
  importProvidersFrom,
} from '@angular/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { appFeature } from './store/app/app.reducer';
import { environment } from '../environments/environment';
import Encryptor from './helpers/encryptor';
import { settingsFeature } from './store/settings/settings.reducer';

const encDec = {
  encrypt: Encryptor.encFunction,
  decrypt: Encryptor.decFunction,
};

export interface AppState {
  appState: ReturnType<typeof appFeature.reducer>;
  settingsState: ReturnType<typeof settingsFeature.reducer>;
}

const reducers: ActionReducerMap<AppState> = {
  appState: appFeature.reducer,
  settingsState: settingsFeature.reducer,
};

export function localStorageSyncReducer(
  reducer: ActionReducer<AppState>,
): ActionReducer<AppState> {
  return (state, action) => {
    const nextState = localStorageSync({
      keys: [{ [appFeature.name]: encDec }],
      rehydrate: true,
    })(reducer)(state, action);

    console.log('Persisting state to localStorage:', nextState);
    return nextState;
  };
}

export const metaReducers: Array<MetaReducer<AppState>> = [
  localStorageSyncReducer,
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),

    // Angular core and material modules
    provideAnimationsAsync(),
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline' },
    },

    // HTTP client and interceptors (DI)
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ErrorInterceptor,
      multi: true,
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: TokenInterceptor,
      multi: true,
    },

    // NgRx store with devtools and metaReducers
    provideStore(reducers, {
      metaReducers,
      runtimeChecks: {
        strictActionImmutability: false,
        strictActionSerializability: false,
        strictStateImmutability: false,
        strictStateSerializability: false,
      },
    }),

    // ✅ New translation loader config (no factory function required)
    importProvidersFrom(
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useClass: TranslateHttpLoader,
        },
      }),
      ServiceWorkerModule.register('ngsw-worker.js', {
        enabled: environment.production,
        registrationStrategy: 'registerWhenStable:30000',
      }),
    ),

    {
      provide: TRANSLATE_HTTP_LOADER_CONFIG,
      useValue: {
        prefix: './assets/i18n/',
        suffix: '.json',
      },
    },
  ],
};
