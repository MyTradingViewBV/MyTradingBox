import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
  withXhr,
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

// Store configuration
import { ActionReducerMap, provideStore } from '@ngrx/store';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
  importProvidersFrom,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { appFeature } from './store/app/app.reducer';
import { settingsFeature } from './store/settings/settings.reducer';
import { keyZonesFeature } from './store/keyzones/keyzones.reducer';
import { environment } from '../environments/environment';

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

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),

    // Angular core and material modules
    provideAnimationsAsync(),
    // Angular Material defaults removed

    // HTTP client and interceptors (DI)
    provideHttpClient(withXhr(), withInterceptorsFromDi()),
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

    // Store state is intentionally memory-only: never persist access tokens or user data in browser storage.
    provideStore(reducers, {
      runtimeChecks: {
        strictActionImmutability: true,
        strictActionSerializability: false,
        strictStateImmutability: true,
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
      enabled: environment.production && !environment.disableSw,
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
