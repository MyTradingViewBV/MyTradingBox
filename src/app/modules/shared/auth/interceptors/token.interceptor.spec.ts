import { TestBed } from '@angular/core/testing';
import {
  HTTP_INTERCEPTORS,
  HttpClient,
  HttpHeaders,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { Store, provideStore } from '@ngrx/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from 'src/environments/environment';
import { AppActions } from 'src/app/store/app/app.actions';
import { rootMetaReducers, rootReducers } from 'src/app/store/root.store';
import { buildJwt, loginResponse } from 'src/testing/jwt';
import { AppService } from '../../services/services/appService';
import { TokenInterceptor } from './token.interceptor';

describe('TokenInterceptor', () => {
  const apiUrl = `${environment.apiUrl}Symbols`;
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let appService: AppService;
  let logout: ReturnType<typeof vi.spyOn>;
  let navigate: ReturnType<typeof vi.fn>;
  let originalPath: string;

  function setToken(accessToken: string): void {
    TestBed.inject(Store).dispatch(AppActions.setToken({ token: loginResponse(accessToken) }));
  }

  /** Subscribes and records the outcome of a GET. */
  function get(url: string, headers?: HttpHeaders): { value?: unknown; error?: unknown } {
    const outcome: { value?: unknown; error?: unknown } = {};
    http.get(url, { headers }).subscribe({
      next: (value) => (outcome.value = value),
      error: (error) => (outcome.error = error),
    });
    return outcome;
  }

  beforeEach(() => {
    localStorage.clear();
    originalPath = window.location.pathname;
    history.pushState({}, '', '/dashboard');
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideStore(rootReducers, { metaReducers: rootMetaReducers }),
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        { provide: HTTP_INTERCEPTORS, useClass: TokenInterceptor, multi: true },
        { provide: Router, useValue: { navigate } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    appService = TestBed.inject(AppService);
    logout = vi.spyOn(appService, 'logout');
  });

  afterEach(() => {
    httpMock.verify();
    history.pushState({}, '', originalPath);
    localStorage.clear();
  });

  describe('request routing', () => {
    it('attaches the bearer token to requests for the API', () => {
      const token = buildJwt(3600);
      setToken(token);

      const outcome = get(apiUrl);
      const req = httpMock.expectOne(apiUrl);
      expect(req.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
      req.flush([{ Id: 1 }]);

      expect(outcome.value).toEqual([{ Id: 1 }]);
      expect(logout).not.toHaveBeenCalled();
    });

    it.each(['assets/version.json', 'https://api.binance.com/api/v3/ticker/price'])(
      'leaves %s untouched and never logs out, even without a session',
      (url) => {
        const outcome = get(url);
        const req = httpMock.expectOne(url);
        expect(req.request.headers.has('Authorization')).toBe(false);
        req.flush({ ok: true });

        expect(outcome.value).toEqual({ ok: true });
        expect(logout).not.toHaveBeenCalled();
      },
    );

    it('does not send the token to relative URLs even when logged in', () => {
      setToken(buildJwt(3600));

      get('assets/i18n/nl.json');
      const req = httpMock.expectOne('assets/i18n/nl.json');
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    });

    it('strips the Skip-Auth header and sends no token', () => {
      setToken(buildJwt(3600));

      get(apiUrl, new HttpHeaders({ 'Skip-Auth': 'true' }));
      const req = httpMock.expectOne(apiUrl);
      expect(req.request.headers.has('Skip-Auth')).toBe(false);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush([]);
    });

    it('lets a Skip-Auth request through without a session and does not log out', () => {
      const outcome = get(apiUrl, new HttpHeaders({ 'Skip-Auth': 'true' }));
      httpMock.expectOne(apiUrl).flush({ PublicKey: 'k' });

      expect(outcome.value).toEqual({ PublicKey: 'k' });
      expect(logout).not.toHaveBeenCalled();
    });
  });

  describe('missing or expired session', () => {
    it('logs out and fails without sending the request when no token exists', () => {
      const outcome = get(apiUrl);

      httpMock.expectNone(apiUrl);
      expect(outcome.error).toEqual(new Error('Not authenticated'));
      expect(logout).toHaveBeenCalledTimes(1);
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });

    it.each(['/login', '/MyTradingBox/login', '/login/'])(
      'passes the request through without a token on %s',
      (path) => {
        history.pushState({}, '', path);

        const outcome = get(apiUrl);
        const req = httpMock.expectOne(apiUrl);
        expect(req.request.headers.has('Authorization')).toBe(false);
        req.flush({ token: 'x' });

        expect(outcome.value).toEqual({ token: 'x' });
        expect(logout).not.toHaveBeenCalled();
      },
    );

    it('does not treat paths that merely contain "login" as the login page', () => {
      history.pushState({}, '', '/loginhistory');

      const outcome = get(apiUrl);

      httpMock.expectNone(apiUrl);
      expect(outcome.error).toEqual(new Error('Not authenticated'));
      expect(logout).toHaveBeenCalled();
    });

    it('logs out with "Session expired" when the token has expired', () => {
      setToken(buildJwt(-60));

      const outcome = get(apiUrl);

      httpMock.expectNone(apiUrl);
      expect(outcome.error).toEqual(new Error('Session expired'));
      expect(logout).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });
  });

  describe('API error mapping', () => {
    beforeEach(() => setToken(buildJwt(3600)));

    it('logs out on a 401 from the API', () => {
      const outcome = get(apiUrl);
      httpMock.expectOne(apiUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(outcome.error).toEqual(new Error('Unauthorized'));
      expect(logout).toHaveBeenCalledTimes(1);
    });

    it('does not log out on a 401 from a non-API URL and keeps the raw error', () => {
      const url = 'https://example.com/private';
      const outcome = get(url);
      httpMock.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(outcome.error).toEqual(expect.objectContaining({ status: 401 }));
      expect(logout).not.toHaveBeenCalled();
    });

    it('maps a 400 to the server-provided message', () => {
      const outcome = get(apiUrl);
      httpMock
        .expectOne(apiUrl)
        .flush({ message: 'Symbol is required' }, { status: 400, statusText: 'Bad Request' });

      expect(outcome.error).toEqual(new Error('Symbol is required'));
      expect(logout).not.toHaveBeenCalled();
    });

    it('maps a 400 without a body message to the HTTP error message', () => {
      const outcome = get(apiUrl);
      httpMock.expectOne(apiUrl).flush('bad', { status: 400, statusText: 'Bad Request' });

      expect((outcome.error as Error).message).toContain('400 Bad Request');
    });

    it('maps a 404 to "Not found"', () => {
      const outcome = get(apiUrl);
      httpMock.expectOne(apiUrl).flush(null, { status: 404, statusText: 'Not Found' });

      expect(outcome.error).toEqual(new Error('Not found'));
    });

    it('rethrows other HTTP errors unchanged', () => {
      const outcome = get(apiUrl);
      httpMock.expectOne(apiUrl).flush(null, { status: 500, statusText: 'Server Error' });

      expect(outcome.error).toEqual(expect.objectContaining({ status: 500 }));
      expect(logout).not.toHaveBeenCalled();
    });
  });
});
