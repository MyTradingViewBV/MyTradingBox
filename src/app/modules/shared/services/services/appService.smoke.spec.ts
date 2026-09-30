import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { Store, provideStore } from '@ngrx/store';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AppService } from './appService';
import { LoginResponse } from '../../models/login/loginResponse.dto';
import { appFeature } from '../../../../store/app/app.reducer';
import { rootMetaReducers, rootReducers } from '../../../../store/root.store';
import { PERSISTED_KEYS } from '../../../../store/persistence/state-persistence.meta-reducer';

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

function storedSession(accessToken: string): string {
  return JSON.stringify({
    AccessToken: accessToken,
    ExpiresIn: '',
    CreatedAt: new Date().toISOString(),
  });
}

describe('AppService authentication persistence', () => {
  const storageKey = PERSISTED_KEYS.auth;
  let navigate: ReturnType<typeof vi.fn>;

  /** Creates the store (which hydrates from localStorage) and then AppService. */
  function setup(): { appService: AppService; store: Store } {
    TestBed.configureTestingModule({
      providers: [
        provideStore(rootReducers, { metaReducers: rootMetaReducers }),
        { provide: Router, useValue: { navigate } },
      ],
    });
    return { appService: TestBed.inject(AppService), store: TestBed.inject(Store) };
  }

  async function currentToken(store: Store): Promise<LoginResponse | null> {
    return firstValueFrom(store.select(appFeature.selectToken));
  }

  beforeEach(() => {
    localStorage.clear();
    navigate = vi.fn().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('persists a login and removes it when clearing app state', () => {
    const { appService } = setup();
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

  it('hydrates a valid stored login before consumers read the store', async () => {
    // Fake only the timers: a Date created by a faked Date constructor would be
    // deep-frozen by NgRx (together with the global Date) once it reaches the store.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const accessToken = buildJwt(3600);
    localStorage.setItem(storageKey, storedSession(accessToken));

    const { appService, store } = setup();

    expect(appService).toBeTruthy();
    expect((await currentToken(store))?.AccessToken).toBe(accessToken);
    expect(localStorage.getItem(storageKey)).not.toBeNull();

    // The restored session schedules an automatic logout at JWT expiry.
    vi.advanceTimersByTime(3600 * 1000 + 1000);
    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(await currentToken(store)).toBeNull();
  });

  it('migrates the legacy session key so existing users stay logged in', async () => {
    const accessToken = buildJwt(3600);
    localStorage.setItem('mtb.auth.session', storedSession(accessToken));

    const { store } = setup();

    expect((await currentToken(store))?.AccessToken).toBe(accessToken);
    expect(localStorage.getItem('mtb.auth.session')).toBeNull();
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });

  it('discards a stored login whose JWT has expired', async () => {
    localStorage.setItem(storageKey, storedSession(buildJwt(-60)));

    const { store } = setup();

    expect(await currentToken(store)).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('discards a stored opaque token without a known expiry (fails closed)', async () => {
    localStorage.setItem(storageKey, storedSession('opaque-token'));

    const { store } = setup();

    expect(await currentToken(store)).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('removes malformed stored authentication data', async () => {
    localStorage.setItem(storageKey, '{invalid');

    const { store } = setup();

    expect(await currentToken(store)).toBeNull();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});
