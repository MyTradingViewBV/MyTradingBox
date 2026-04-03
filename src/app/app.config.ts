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
import { getUserIdFromToken } from './modules/shared/utils/token-expiry.util';

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

/**
 * Generate user-scoped localStorage key to isolate data per account.
 * Format: "keyName_userId" when user is logged in, "keyName" when logged out.
 */
function getUserScopedKey(keyName: string, state: AppState): string {
  const token = state?.appState?.token;
  if (!token?.AccessToken) {
    return keyName; // No token: use global key
  }
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return keyName; // No userId extracted: use global key
  }
  return `${keyName}_${userId}`;
}

export function localStorageSyncReducer(
  reducer: ActionReducer<AppState>,
): ActionReducer<AppState> {
  let lastUserId: string | null = null;
  
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
    
    // Extract current userId for key scoping
    const currentUserId = baseState?.appState?.token?.AccessToken 
      ? getUserIdFromToken(baseState.appState.token) 
      : null;
    
    // Detect user switch: clear previous user's data from localStorage
    if (lastUserId && lastUserId !== currentUserId) {
      try {
        // Remove old user's scoped keys from localStorage
        const oldAppKey = `${appFeature.name}_${lastUserId}`;
        const oldSettingsKey = `${settingsFeature.name}_${lastUserId}`;
        const oldKeyZonesKey = `${keyZonesFeature.name}_${lastUserId}`;
        window.localStorage.removeItem(oldAppKey);
        window.localStorage.removeItem(oldSettingsKey);
        window.localStorage.removeItem(oldKeyZonesKey);
      } catch {}
    }
    lastUserId = currentUserId;
    
    // Apply localStorage sync with user-scoped keys
    const syncReducer = localStorageSync({
      keys: [
        { [appFeature.name]: encDec },
        { [settingsFeature.name]: encDec },
        { [keyZonesFeature.name]: encDec },
      ],
      rehydrate: true,
      storage: window?.localStorage,
    })(reducer);
    
    // Custom rehydration with user-scoped keys
    const rehydratedState = syncReducer(baseState, action) ?? baseState;
    
    // If we have a current user, manually apply user-scoped rehydration
    if (currentUserId) {
      try {
        const appKey = getUserScopedKey(appFeature.name, rehydratedState);
        const settingsKey = getUserScopedKey(settingsFeature.name, rehydratedState);
        const keyZonesKey = getUserScopedKey(keyZonesFeature.name, rehydratedState);
        
        // Try to load user-scoped data, fall back to default if not found
        const encAppData = window.localStorage.getItem(appKey);
        const encSettingsData = window.localStorage.getItem(settingsKey);
        const encKeyZonesData = window.localStorage.getItem(keyZonesKey);
        
        if (encAppData) {
          try {
            const appData = JSON.parse(Encryptor.decFunction(encAppData));
            if (appData) {
              rehydratedState.appState = { ...rehydratedState.appState, ...appData };
            }
          } catch {}
        }
        if (encSettingsData) {
          try {
            const settingsData = JSON.parse(Encryptor.decFunction(encSettingsData));
            if (settingsData) {
              rehydratedState.settingsState = { ...rehydratedState.settingsState, ...settingsData };
            }
          } catch {}
        }
        if (encKeyZonesData) {
          try {
            const keyZonesData = JSON.parse(Encryptor.decFunction(encKeyZonesData));
            if (keyZonesData) {
              rehydratedState.keyZonesState = { ...rehydratedState.keyZonesState, ...keyZonesData };
            }
          } catch {}
        }
      } catch {}
    }
    
    return rehydratedState;
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

    // ✅ Service Worker for PWA (Capacitor compatible)
    // custom-sw.js imports ngsw-worker.js and adds push notification handlers
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
