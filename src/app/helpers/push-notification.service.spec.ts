import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from 'src/environments/environment';
import { rootMetaReducers, rootReducers } from 'src/app/store/root.store';
import { PushNotificationService } from './push-notification.service';

describe('PushNotificationService.unsubscribe', () => {
  const unsubscribeUrl = `${environment.apiUrl.replace(/\/+$/, '')}/api/notifications/webpush/unsubscribe`;
  const endpoint = 'https://push.example.test/send/abc';
  let service: PushNotificationService;
  let http: HttpTestingController;
  let browserUnsubscribe: ReturnType<typeof vi.fn>;
  let getRegistration: ReturnType<typeof vi.fn>;
  let hadPushManager: boolean;
  let originalSw: PropertyDescriptor | undefined;

  function stubRegistration(subscription: unknown): void {
    getRegistration.mockResolvedValue({
      pushManager: { getSubscription: async () => subscription },
    });
  }

  beforeEach(() => {
    localStorage.clear();
    hadPushManager = 'PushManager' in window;
    if (!hadPushManager) {
      (window as unknown as Record<string, unknown>)['PushManager'] = class {};
    }
    originalSw = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    getRegistration = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration },
    });
    browserUnsubscribe = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        provideStore(rootReducers, { metaReducers: rootMetaReducers }),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Router,
          useValue: { navigate: vi.fn().mockResolvedValue(true) },
        },
      ],
    });
    service = TestBed.inject(PushNotificationService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    if (originalSw) {
      Object.defineProperty(navigator, 'serviceWorker', originalSw);
    } else {
      delete (navigator as unknown as Record<string, unknown>)['serviceWorker'];
    }
    if (!hadPushManager) {
      delete (window as unknown as Record<string, unknown>)['PushManager'];
    }
    vi.restoreAllMocks();
  });

  it('makes no API call when there is no registration', async () => {
    getRegistration.mockResolvedValue(undefined);

    await service.unsubscribe('jwt');

    http.expectNone(unsubscribeUrl);
    expect(browserUnsubscribe).not.toHaveBeenCalled();
  });

  /** Waits for the (async) unsubscribe POST to be issued and returns it. */
  async function nextUnsubscribeRequest() {
    let found: ReturnType<HttpTestingController['match']>[number] | undefined;
    await vi.waitFor(() => {
      found = http.match(unsubscribeUrl)[0];
      expect(found).toBeDefined();
    });
    return found!;
  }

  it('posts the endpoint with the explicit token, then unsubscribes the browser', async () => {
    stubRegistration({ endpoint, unsubscribe: browserUnsubscribe });

    const done = service.unsubscribe('jwt-1');
    const req = await nextUnsubscribeRequest();

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe(JSON.stringify(endpoint));
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-1');
    expect(req.request.headers.get('Content-Type')).toBe('application/json');
    // Skip-Auth keeps a 401 here from re-entering logout() via the interceptor
    expect(req.request.headers.get('Skip-Auth')).toBe('true');
    // the browser subscription is only dropped after the API call settled
    expect(browserUnsubscribe).not.toHaveBeenCalled();
    req.flush({ message: 'ok' });
    await done;

    expect(browserUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('still unsubscribes the browser when the API call fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stubRegistration({ endpoint, unsubscribe: browserUnsubscribe });

    const done = service.unsubscribe('jwt-1');
    const req = await nextUnsubscribeRequest();
    req.flush('boom', { status: 500, statusText: 'Server Error' });
    await done;

    expect(browserUnsubscribe).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });

  it('skips the API call without a token but still unsubscribes the browser', async () => {
    stubRegistration({ endpoint, unsubscribe: browserUnsubscribe });

    await service.unsubscribe();

    http.expectNone(unsubscribeUrl);
    expect(browserUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
