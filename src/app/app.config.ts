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
import { provideServiceWorker } from '@angular/service-worker';
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
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { appFeature } from './store/app/app.reducer';
import { environment } from '../environments/environment';
import Encryptor from './helpers/encryptor';
import { settingsFeature } from './store/settings/settings.reducer';
import { keyZonesFeature } from './store/keyzones/keyzones.reducer';

const encDec = {
  encrypt: Encryptor.encFunction,
  decrypt: Encryptor.decFunction,
};

export interface AppState {
  appState: ReturnType<typeof appFeature.reducer>;
  settingsState: ReturnType<typeof settingsFeature.reducer>;
  keyZonesState: ReturnType<typeof keyZonesFeature.reducer>;
}

const reducers: ActionReducerMap<AppState> = {
  appState: appFeature.reducer,
  settingsState: settingsFeature.reducer,
  keyZonesState: keyZonesFeature.reducer,
};

export function localStorageSyncReducer(
  reducer: ActionReducer<AppState>,
): ActionReducer<AppState> {
  return (state, action) => {
    // Versioned storage reset: if deployed version changed, clear persisted slices
    try {
      const STORAGE_VERSION_KEY = 'mtb_version';
      const currentVersion = environment.version;
      const storedVersion = window?.localStorage?.getItem(STORAGE_VERSION_KEY);
      if (currentVersion && storedVersion && storedVersion !== currentVersion) {
        // Remove only our feature keys to avoid nuking unrelated data
        const keysToRemove = [appFeature.name, settingsFeature.name, keyZonesFeature.name];
        for (const k of keysToRemove) {
          try { window.localStorage.removeItem(k); } catch {}
        }
        try { window.localStorage.setItem(STORAGE_VERSION_KEY, currentVersion); } catch {}
      } else if (currentVersion && !storedVersion) {
        try { window.localStorage.setItem(STORAGE_VERSION_KEY, currentVersion); } catch {}
      }
    } catch {}
    // First run base reducer to guarantee a defined state shape
    const baseState = reducer(state, action);
    // Apply localStorage sync rehydration/persistence
    const syncReducer = localStorageSync({
      keys: [
        { [appFeature.name]: encDec },
        { [settingsFeature.name]: encDec },
        { [keyZonesFeature.name]: encDec },
      ],
      rehydrate: true,
      // Ensure we never produce undefined on rehydrate in prod
      storage: window?.localStorage,
    })(reducer);
    const nextState = syncReducer(baseState, action) ?? baseState;
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
    // Angular Material defaults removed

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

    // ✅ Translations and Service Worker with Capacitor support
    importProvidersFrom(
      TranslateModule.forRoot({
        loader: {
          provide: TranslateLoader,
          useClass: TranslateHttpLoader,
        },
      }),
    ),

    // ✅ Register custom worker that extends ngsw-worker for push handling
    provideServiceWorker('custom-sw.js', {
      enabled: environment.production,
      registrationStrategy: 'registerImmediately', // Important for Capacitor
    }),

    {
      provide: TRANSLATE_HTTP_LOADER_CONFIG,
      useValue: {
        prefix: './assets/i18n/',
        suffix: '.json',
      },
    },
  ],
};
