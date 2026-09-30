import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Store, provideStore } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppActions } from 'src/app/store/app/app.actions';
import { appFeature } from 'src/app/store/app/app.reducer';
import { rootMetaReducers, rootReducers } from 'src/app/store/root.store';
import { PERSISTED_KEYS } from 'src/app/store/persistence/state-persistence.meta-reducer';
import { NAME_CLAIM, NAME_IDENTIFIER_CLAIM, ROLE_CLAIM, buildJwt, loginResponse } from 'src/testing/jwt';
import { AppService } from './appService';

describe('AppService', () => {
  let navigate: ReturnType<typeof vi.fn>;
  let store: Store;

  function setup(): AppService {
    TestBed.configureTestingModule({
      providers: [
        provideStore(rootReducers, { metaReducers: rootMetaReducers }),
        { provide: Router, useValue: { navigate } },
      ],
    });
    store = TestBed.inject(Store);
    return TestBed.inject(AppService);
  }

  const token$ = () => firstValueFrom(store.select(appFeature.selectToken));

  /**
   * Only timers are faked: a Date created by a faked Date constructor would be
   * deep-frozen by NgRx's immutability check together with the global Date.
   */
  function useFakeTimeouts(): void {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  }

  beforeEach(() => {
    localStorage.clear();
    navigate = vi.fn().mockResolvedValue(true);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => localStorage.clear());

  describe('identity from the token', () => {
    it('reports admin only for a token carrying the admin role', async () => {
      const service = setup();
      expect(await firstValueFrom(service.isAdmin())).toBe(false);

      service.handleNewLoginToken(loginResponse(buildJwt(3600, { [ROLE_CLAIM]: 'Guest' })));
      expect(await firstValueFrom(service.isAdmin())).toBe(false);

      service.handleNewLoginToken(loginResponse(buildJwt(3600, { [ROLE_CLAIM]: ['Guest', 'Admin'] })));
      expect(await firstValueFrom(service.isAdmin())).toBe(true);
    });

    it('exposes the e-mail and user id claims, or empty strings without a session', async () => {
      const service = setup();
      expect(await firstValueFrom(service.getUserEmail())).toBe('');
      expect(await firstValueFrom(service.getUserId$())).toBe('');

      service.handleNewLoginToken(
        loginResponse(buildJwt(3600, { [NAME_CLAIM]: 'erwin@example.com', [NAME_IDENTIFIER_CLAIM]: 'u-1' })),
      );

      expect(await firstValueFrom(service.getUserEmail())).toBe('erwin@example.com');
      expect(await firstValueFrom(service.getUserId$())).toBe('u-1');
    });
  });

  describe('isAuthorized', () => {
    it('is false without a token and does not log out', async () => {
      const service = setup();

      expect(await firstValueFrom(service.isAuthorized())).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('is true for a valid token', async () => {
      const service = setup();
      service.handleNewLoginToken(loginResponse(buildJwt(3600)));

      expect(await firstValueFrom(service.isAuthorized())).toBe(true);
    });

    it('logs out and is false once the token has expired', async () => {
      const service = setup();
      store.dispatch(AppActions.setToken({ token: loginResponse(buildJwt(-60)) }));

      expect(await firstValueFrom(service.isAuthorized())).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/login']);
      expect(await token$()).toBeNull();
    });
  });

  describe('logout', () => {
    it('clears the session from store and storage, keeps onboarding and goes to /login', async () => {
      const service = setup();
      store.dispatch(AppActions.completeOnboarding());
      service.handleNewLoginToken(loginResponse(buildJwt(3600)));
      expect(localStorage.getItem(PERSISTED_KEYS.auth)).not.toBeNull();

      service.logout();

      expect(await token$()).toBeNull();
      expect(localStorage.getItem(PERSISTED_KEYS.auth)).toBeNull();
      expect(await firstValueFrom(store.select(appFeature.selectOnboardingDone))).toBe(true);
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/login']);
    });

    it('cancels the pending auto-logout', async () => {
      useFakeTimeouts();
      const service = setup();
      service.handleNewLoginToken(loginResponse(buildJwt(60)));

      service.logout();
      service.handleNewLoginToken(loginResponse('opaque-token'));
      vi.advanceTimersByTime(120_000);

      // Only the explicit logout navigated; the cancelled timer never fired.
      expect(navigate).toHaveBeenCalledTimes(1);
      expect((await token$())?.AccessToken).toBe('opaque-token');
    });
  });

  describe('handleNewLoginToken', () => {
    it('stores the token and logs out automatically just after the JWT expires', async () => {
      useFakeTimeouts();
      const service = setup();
      const token = loginResponse(buildJwt(60));

      service.handleNewLoginToken(token);
      expect(await token$()).toBe(token);

      // exp is whole seconds, so the timer fires 59.5 s - 60.5 s from now.
      vi.advanceTimersByTime(59_000);
      expect(navigate).not.toHaveBeenCalled();
      expect(await token$()).toBe(token);

      vi.advanceTimersByTime(2_000);
      expect(navigate).toHaveBeenCalledWith(['/login']);
      expect(await token$()).toBeNull();
    });

    it('replaces the timer of a previous login', () => {
      useFakeTimeouts();
      const service = setup();
      service.handleNewLoginToken(loginResponse(buildJwt(60)));
      service.handleNewLoginToken(loginResponse(buildJwt(3600)));

      vi.advanceTimersByTime(120_000);
      expect(navigate).not.toHaveBeenCalled();

      vi.advanceTimersByTime(3600_000);
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('does not schedule a logout for a token without a known expiry', () => {
      useFakeTimeouts();
      const service = setup();

      service.handleNewLoginToken(loginResponse('opaque-token'));
      vi.advanceTimersByTime(365 * 24 * 3600_000);

      expect(navigate).not.toHaveBeenCalled();
    });

    it('does not schedule a logout for an already expired token', () => {
      useFakeTimeouts();
      const service = setup();

      service.handleNewLoginToken(loginResponse(buildJwt(-5)));
      vi.advanceTimersByTime(24 * 3600_000);

      // No timer: expired tokens are rejected by isAuthorized() instead.
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it('clears an expired token that is already in the store when the service starts', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideStore(rootReducers, { metaReducers: rootMetaReducers }),
        { provide: Router, useValue: { navigate } },
      ],
    });
    store = TestBed.inject(Store);
    store.dispatch(AppActions.setToken({ token: loginResponse(buildJwt(-60)) }));

    TestBed.inject(AppService);

    expect(await token$()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps the chosen language when the app state is cleared (logout)', async () => {
    const service = setup();
    service.dispatchAppAction(AppActions.setLanguage({ language: 'en' }));
    expect((await firstValueFrom(service.getAppState())).language).toBe('en');

    service.clearAppState();

    expect((await firstValueFrom(service.getAppState())).language).toBe('en');
  });
});
