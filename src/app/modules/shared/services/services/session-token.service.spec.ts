import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { Store, provideStore } from '@ngrx/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from 'src/environments/environment';
import { AppActions } from 'src/app/store/app/app.actions';
import { rootMetaReducers, rootReducers } from 'src/app/store/root.store';
import { buildJwt, loginResponse } from 'src/testing/jwt';
import { AppService } from './appService';
import { SessionTokenService } from './session-token.service';

describe('SessionTokenService', () => {
  const vapidUrl = `${environment.apiUrl.replace(/\/+$/, '')}/api/notifications/webpush/vapid-key`;
  const originalVapidKey = environment.vapidPublicKey;
  let service: SessionTokenService;
  let httpMock: HttpTestingController;
  let logout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideStore(rootReducers, { metaReducers: rootMetaReducers }),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
      ],
    });
    logout = vi.spyOn(TestBed.inject(AppService), 'logout');
    service = TestBed.inject(SessionTokenService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    environment.vapidPublicKey = originalVapidKey;
    localStorage.clear();
  });

  function login(accessToken: string): void {
    TestBed.inject(Store).dispatch(AppActions.setToken({ token: loginResponse(accessToken) }));
  }

  describe('getValidAccessToken', () => {
    it('returns the access token of a valid session', async () => {
      const token = buildJwt(3600);
      login(token);

      await expect(service.getValidAccessToken()).resolves.toBe(token);
      expect(logout).not.toHaveBeenCalled();
    });

    it('logs out and rejects when there is no session', async () => {
      await expect(service.getValidAccessToken()).rejects.toThrow('Not authenticated');
      expect(logout).toHaveBeenCalled();
    });

    it('logs out and rejects when the session has expired', async () => {
      login(buildJwt(-60));

      await expect(service.getValidAccessToken()).rejects.toThrow('Session expired');
      expect(logout).toHaveBeenCalled();
    });
  });

  describe('getVapidPublicKey', () => {
    /** Starts the lookup; the HTTP request is issued synchronously. */
    function requestKey(): Promise<string> {
      const pending = service.getVapidPublicKey();
      pending.catch(() => undefined); // asserted by the caller
      return pending;
    }

    it('prefers a configured key from the environment without calling the API', async () => {
      environment.vapidPublicKey = '  BConfiguredKey  ';

      await expect(service.getVapidPublicKey()).resolves.toBe('BConfiguredKey');
      httpMock.expectNone(vapidUrl);
    });

    it.each(['REPLACE_WITH_YOUR_PUBLIC_VAPID_KEY', '', '   '])(
      'fetches the key from the public API endpoint when the environment key is %j',
      async (configured) => {
        environment.vapidPublicKey = configured;

        const pending = requestKey();
        const req = httpMock.expectOne(vapidUrl);
        expect(req.request.method).toBe('GET');
        expect(req.request.headers.get('Skip-Auth')).toBe('true');
        req.flush({ PublicKey: ' BServerKey ' });

        await expect(pending).resolves.toBe('BServerKey');
      },
    );

    it('returns an empty string when the API response has no key', async () => {
      const pending = requestKey();
      httpMock.expectOne(vapidUrl).flush(null);

      await expect(pending).resolves.toBe('');
    });

    it('reports the status and text body of a failed lookup', async () => {
      const pending = requestKey();
      httpMock.expectOne(vapidUrl).flush('push disabled', { status: 503, statusText: 'Unavailable' });

      await expect(pending).rejects.toThrow('Failed to fetch VAPID key: 503 push disabled');
    });

    it('falls back to the status text when the error body is not text', async () => {
      const pending = requestKey();
      httpMock
        .expectOne(vapidUrl)
        .flush({ detail: 'x' }, { status: 500, statusText: 'Internal Server Error' });

      await expect(pending).rejects.toThrow('Failed to fetch VAPID key: 500 Internal Server Error');
    });
  });
});
