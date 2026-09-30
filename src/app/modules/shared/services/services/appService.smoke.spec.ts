import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AppService } from './appService';
import { LoginResponse } from '../../models/login/loginResponse.dto';
import { AppActions } from '../../../../store/app/app.actions';

function base64Url(value: unknown): string {
  return btoa(JSON.stringify(value))
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/** Builds an unsigned JWT whose `exp` claim lies `secondsFromNow` in the future (or past). */
function buildJwt(secondsFromNow: number): string {
  const exp = Math.floor(Date.now() / 1000) + secondsFromNow;
  return `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({ exp })}.signature`;
}

describe('AppService authentication persistence', () => {
  const storageKey = 'mtb.auth.session';
  let appService: AppService;
  let dispatch: ReturnType<typeof vi.fn>;
  let select: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    dispatch = vi.fn();
    select = vi.fn().mockReturnValue(of(null));
    navigate = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        AppService,
        { provide: Store, useValue: { dispatch, select } },
        { provide: Router, useValue: { navigate } },
      ],
    });
    appService = TestBed.inject(AppService);
  });

  afterEach(() => localStorage.clear());

  it('persists a login and removes it when clearing app state', () => {
    const token = new LoginResponse();
    token.AccessToken = 'header.payload.signature';

    appService.handleNewLoginToken(token);

    expect(JSON.parse(localStorage.getItem(storageKey) || '{}')).toEqual({
      AccessToken: token.AccessToken,
      ExpiresIn: token.ExpiresIn,
      CreatedAt: token.CreatedAt.toISOString(),
    });

    appService.clearAppState();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('hydrates a valid stored login before consumers read the store', () => {
    vi.useFakeTimers();
    try {
      const accessToken = buildJwt(3600);
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          AccessToken: accessToken,
          ExpiresIn: '',
          CreatedAt: new Date().toISOString(),
        }),
      );

      const hydratedService = TestBed.runInInjectionContext(
        () => new AppService(),
      );

      expect(hydratedService).toBeTruthy();
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: AppActions.setToken.type,
          token: expect.objectContaining({ AccessToken: accessToken }),
        }),
      );
      expect(localStorage.getItem(storageKey)).not.toBeNull();

      // The restored session schedules an automatic logout at JWT expiry.
      vi.advanceTimersByTime(3600 * 1000 + 1000);
      expect(navigate).toHaveBeenCalledWith(['/login']);
      expect(localStorage.getItem(storageKey)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('discards a stored login whose JWT has expired', () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        AccessToken: buildJwt(-60),
        ExpiresIn: '',
        CreatedAt: new Date().toISOString(),
      }),
    );

    TestBed.runInInjectionContext(() => new AppService());

    expect(dispatch).not.toHaveBeenCalled();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('discards a stored opaque token without a known expiry (fails closed)', () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        AccessToken: 'opaque-token',
        ExpiresIn: '',
        CreatedAt: new Date().toISOString(),
      }),
    );

    TestBed.runInInjectionContext(() => new AppService());

    expect(dispatch).not.toHaveBeenCalled();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('removes malformed stored authentication data', () => {
    localStorage.setItem(storageKey, '{invalid');

    TestBed.runInInjectionContext(() => new AppService());

    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});
