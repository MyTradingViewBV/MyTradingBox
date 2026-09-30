import { TestBed } from '@angular/core/testing';
import { Store, provideStore } from '@ngrx/store';
import { firstValueFrom, toArray } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppActions } from 'src/app/store/app/app.actions';
import { rootMetaReducers, rootReducers } from 'src/app/store/root.store';
import { PERSISTED_KEYS } from 'src/app/store/persistence/state-persistence.meta-reducer';
import { buildJwt, loginResponse } from 'src/testing/jwt';
import { TokenStorageService } from './tokenStorage.service';

describe('TokenStorageService', () => {
  function setup(): { service: TokenStorageService; store: Store } {
    TestBed.configureTestingModule({
      providers: [provideStore(rootReducers, { metaReducers: rootMetaReducers })],
    });
    return { service: TestBed.inject(TokenStorageService), store: TestBed.inject(Store) };
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('emits null when nobody is logged in', async () => {
    const { service } = setup();

    expect(await firstValueFrom(service.getToken$())).toBeNull();
  });

  it('emits the token currently held in the store', async () => {
    const { service, store } = setup();
    const token = loginResponse(buildJwt(3600));
    store.dispatch(AppActions.setToken({ token }));

    expect(await firstValueFrom(service.getToken$())).toBe(token);
  });

  it('reads a session hydrated from storage', async () => {
    const accessToken = buildJwt(3600);
    localStorage.setItem(
      PERSISTED_KEYS.auth,
      JSON.stringify({ AccessToken: accessToken, ExpiresIn: '', CreatedAt: new Date().toISOString() }),
    );
    const { service } = setup();

    expect((await firstValueFrom(service.getToken$()))?.AccessToken).toBe(accessToken);
  });

  it('emits a single snapshot and completes (does not follow later changes)', async () => {
    const { service, store } = setup();
    const emissions = firstValueFrom(service.getToken$().pipe(toArray()));
    store.dispatch(AppActions.setToken({ token: loginResponse(buildJwt(3600)) }));

    expect(await emissions).toEqual([null]);
  });
});
