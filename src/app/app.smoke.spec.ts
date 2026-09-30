import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';
import { appFeature } from './store/app/app.reducer';
import { settingsFeature } from './store/settings/settings.reducer';
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

  it('restores completed onboarding from storage and hides the overlay', async () => {
    localStorage.setItem('mtb.onboarding.complete', '1');

    const fixture = await createAndInit();

    expect(
      await firstValueFrom(
        TestBed.inject(Store).select(appFeature.selectOnboardingDone),
      ),
    ).toBe(true);
    expect(fixture.componentInstance.showOnboarding).toBe(false);
    expect(fixture.nativeElement.querySelector('app-onboarding')).toBeNull();
  });

  it('removes legacy persisted NgRx state and defaults to dark mode once', async () => {
    localStorage.setItem('appState', '{}');
    localStorage.setItem('settingsState_token', '{}');
    localStorage.setItem('mtb_version', '0.0.1');
    localStorage.setItem('unrelated', 'keep');

    await createAndInit();

    expect(localStorage.getItem('appState')).toBeNull();
    expect(localStorage.getItem('settingsState_token')).toBeNull();
    expect(localStorage.getItem('mtb_version')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(localStorage.getItem('mtb.darkmode.default.v1')).toBe('1');
    expect(
      await firstValueFrom(
        TestBed.inject(Store).select(settingsFeature.selectDarkModeEnabled),
      ),
    ).toBe(true);
  });
});
