import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { Store, provideStore } from '@ngrx/store';
import { Observable, EMPTY, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppActions } from 'src/app/store/app/app.actions';
import { rootMetaReducers, rootReducers } from 'src/app/store/root.store';
import { buildJwt, loginResponse } from 'src/testing/jwt';
import { AppService } from '../../services/services/appService';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
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
        authGuard({} as ActivatedRouteSnapshot, { url: '/dashboard' } as RouterStateSnapshot) as Promise<
          boolean | UrlTree
        >,
    );
  }

  function serialized(result: boolean | UrlTree): string | boolean {
    return result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;
  }

  it('allows navigation with a valid session', async () => {
    TestBed.inject(Store).dispatch(AppActions.setToken({ token: loginResponse(buildJwt(3600)) }));

    expect(await run()).toBe(true);
  });

  it('redirects to /login without a session', async () => {
    expect(serialized(await run())).toBe('/login');
  });

  it('redirects to /login and clears the session when the token has expired', async () => {
    // AppService exists before the token turns up (as in the running app).
    const logout = vi.spyOn(TestBed.inject(AppService), 'logout');
    const store = TestBed.inject(Store);
    store.dispatch(AppActions.setToken({ token: loginResponse(buildJwt(-60)) }));

    expect(serialized(await run())).toBe('/login');
    expect(logout).toHaveBeenCalled();
    expect(localStorage.getItem('mtb.state.auth.v1')).toBeNull();
  });

  it.each<[string, () => Observable<boolean>]>([
    ['errors', () => throwError(() => new Error('boom'))],
    ['completes without a value', () => EMPTY],
  ])('logs out and redirects to /login when the authorization check %s', async (_, impl) => {
    const appService = TestBed.inject(AppService);
    vi.spyOn(appService, 'isAuthorized').mockImplementation(impl);
    const logout = vi.spyOn(appService, 'logout');

    expect(serialized(await run())).toBe('/login');
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
