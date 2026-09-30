/**
 * Shared providers and environment stubs for component specs.
 * Test-only: imported exclusively from *.spec.ts files.
 */
import { EnvironmentProviders, Provider, importProvidersFrom } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { provideStore } from '@ngrx/store';
import { TranslateModule } from '@ngx-translate/core';
import { EMPTY } from 'rxjs';
import { rootMetaReducers, rootReducers } from 'src/app/store/root.store';

/** Inert SwUpdate replacement: the service worker is never enabled in unit tests. */
export const swUpdateStub: Partial<SwUpdate> = {
  isEnabled: false,
  versionUpdates: EMPTY,
  unrecoverable: EMPTY,
  checkForUpdate: () => Promise.resolve(false),
  activateUpdate: () => Promise.resolve(false),
};

/**
 * Providers that mirror app.config.ts closely enough to instantiate routed
 * components: real NgRx store (incl. the persistence meta-reducer), HttpClient backed by HttpTestingController,
 * an empty router, translations without a loader (keys render verbatim) and
 * a disabled service worker.
 */
export function provideComponentTestEnvironment(): Array<Provider | EnvironmentProviders> {
  return [
    provideHttpClient(),
    provideHttpClientTesting(),
    provideRouter([]),
    provideStore(rootReducers, { metaReducers: rootMetaReducers }),
    importProvidersFrom(TranslateModule.forRoot()),
    { provide: SwUpdate, useValue: swUpdateStub },
  ];
}

/** jsdom does not implement matchMedia; components use it for display-mode detection. */
export function installMatchMediaStub(matches = false): void {
  if (typeof window.matchMedia === 'function') return;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  });
}
