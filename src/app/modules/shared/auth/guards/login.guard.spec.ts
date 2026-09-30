import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Store, provideStore } from '@ngrx/store';
import { throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppActions } from 'src/app/store/app/app.actions';
import { rootMetaReducers, rootReducers } from 'src/app/store/root.store';
import { buildJwt, loginResponse } from 'src/testing/jwt';
import { AppService } from '../../services/services/appService';
import { loginGuard } from './login.guard';

describe('loginGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideStore(rootReducers, { metaReducers: rootMetaReducers }), provideRouter([])],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => localStorage.clear());

  function run(): Promise<boolean | UrlTree> {
    return TestBed.runInInjectionContext(
      () =>
        loginGuard({} as ActivatedRouteSnapshot, { url: '/login' } as RouterStateSnapshot) as Promise<
          boolean | UrlTree
        >,
    );
  }

  it('sends an already logged-in user to /dashboard', async () => {
    TestBed.inject(Store).dispatch(AppActions.setToken({ token: loginResponse(buildJwt(3600)) }));

    const result = await run();

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/dashboard');
  });

  it('allows the login page without a session', async () => {
    expect(await run()).toBe(true);
  });

  it('allows the login page when the stored token has expired', async () => {
    TestBed.inject(Store).dispatch(AppActions.setToken({ token: loginResponse(buildJwt(-60)) }));

    expect(await run()).toBe(true);
  });

  it('allows the login page when the authorization check fails', async () => {
    vi.spyOn(TestBed.inject(AppService), 'isAuthorized').mockReturnValue(
      throwError(() => new Error('boom')),
    );

    expect(await run()).toBe(true);
  });
});
