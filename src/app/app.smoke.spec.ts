import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';
import { appFeature } from './store/app/app.reducer';
import { settingsFeature } from './store/settings/settings.reducer';
import { PERSISTED_KEYS } from './store/persistence/state-persistence.meta-reducer';
import {
  installMatchMediaStub,
  provideComponentTestEnvironment,
} from 'src/testing/test-providers';

describe('App (root component)', () => {
  beforeEach(async () => {
    localStorage.clear();
    installMatchMediaStub();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideComponentTestEnvironment()],
    }).compileComponents();
  });

  afterEach(() => localStorage.clear());

  async function createAndInit() {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges(); // triggers ngOnInit
    TestBed.inject(HttpTestingController)
      .expectOne((req) => req.url.startsWith('assets/version.json'))
      .flush({ version: '1.0.0' });
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('creates and shows onboarding for a first-time user', async () => {
    const fixture = await createAndInit();

    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.componentInstance.showOnboarding).toBe(true);
    expect(
      fixture.nativeElement.querySelector('app-onboarding'),
    ).not.toBeNull();
  });

  it('migrates legacy completed onboarding from storage and hides the overlay', async () => {
    localStorage.setItem('mtb.onboarding.complete', '1');

    const fixture = await createAndInit();

    expect(
      await firstValueFrom(
        TestBed.inject(Store).select(appFeature.selectOnboardingDone),
      ),
    ).toBe(true);
    expect(fixture.componentInstance.showOnboarding).toBe(false);
    expect(fixture.nativeElement.querySelector('app-onboarding')).toBeNull();
    expect(localStorage.getItem('mtb.onboarding.complete')).toBeNull();
    expect(localStorage.getItem(PERSISTED_KEYS.onboarding)).toBe('true');
  });

  it('removes legacy persisted NgRx state and defaults to dark mode', async () => {
    localStorage.setItem('appState', '{}');
    localStorage.setItem('settingsState_token', '{}');
    localStorage.setItem('mtb_version', '0.0.1');
    localStorage.setItem('unrelated', 'keep');

    await createAndInit();

    expect(localStorage.getItem('appState')).toBeNull();
    expect(localStorage.getItem('settingsState_token')).toBeNull();
    expect(localStorage.getItem('mtb_version')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(
      await firstValueFrom(
        TestBed.inject(Store).select(settingsFeature.selectDarkModeEnabled),
      ),
    ).toBe(true);
    expect(document.body.classList.contains('dark-theme')).toBe(true);
  });

  it('keeps a migrated light theme and applies it to the document', async () => {
    localStorage.setItem('mtb.darkmode.default.v1', '1');
    localStorage.setItem('app.theme', 'light');

    await createAndInit();

    expect(
      await firstValueFrom(
        TestBed.inject(Store).select(settingsFeature.selectDarkModeEnabled),
      ),
    ).toBe(false);
    expect(document.body.classList.contains('light-theme')).toBe(true);
    expect(localStorage.getItem('app.theme')).toBeNull();
    expect(localStorage.getItem(PERSISTED_KEYS.darkMode)).toBe('false');
  });
});
