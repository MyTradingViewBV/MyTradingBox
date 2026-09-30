import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Store, provideStore } from '@ngrx/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppActions } from 'src/app/store/app/app.actions';
import { rootMetaReducers, rootReducers } from 'src/app/store/root.store';
import { ROLE_CLAIM, buildJwt, loginResponse } from 'src/testing/jwt';
import { adminGuard } from './admin.guard';

describe('adminGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideStore(rootReducers, { metaReducers: rootMetaReducers }), provideRouter([])],
    });
  });

  afterEach(() => localStorage.clear());

  function loginWith(accessToken: string): void {
    TestBed.inject(Store).dispatch(AppActions.setToken({ token: loginResponse(accessToken) }));
  }

  function run(): Promise<boolean | UrlTree> {
    return TestBed.runInInjectionContext(
      () =>
        adminGuard({} as ActivatedRouteSnapshot, { url: '/admin' } as RouterStateSnapshot) as Promise<
          boolean | UrlTree
        >,
    );
  }

  async function redirectTarget(): Promise<string | boolean> {
    const result = await run();
    return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
  }

  it('allows an Admin', async () => {
    loginWith(buildJwt(3600, { [ROLE_CLAIM]: 'Admin' }));

    expect(await run()).toBe(true);
  });

  it('allows a user whose roles include admin in a JSON-encoded claim', async () => {
    loginWith(buildJwt(3600, { roles: '["Guest","Admin"]' }));

    expect(await run()).toBe(true);
  });

  it('redirects a non-admin user to /dashboard', async () => {
    loginWith(buildJwt(3600, { [ROLE_CLAIM]: 'Guest' }));

    expect(await redirectTarget()).toBe('/dashboard');
  });

  it('redirects to /dashboard without a session', async () => {
    expect(await redirectTarget()).toBe('/dashboard');
  });

  it('redirects to /dashboard for an opaque (non-JWT) token', async () => {
    loginWith('opaque-token');

    expect(await redirectTarget()).toBe('/dashboard');
  });
});
