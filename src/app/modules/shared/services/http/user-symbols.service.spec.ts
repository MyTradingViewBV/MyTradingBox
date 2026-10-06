import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, of } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { environment } from 'src/environments/environment';
import { SettingsService } from '../services/settingsService';
import { AppService } from '../services/appService';
import { MISSING_USER_ID_MESSAGE, UserSymbolProfile, UserSymbolsService } from './user-symbols.service';

const BASE = environment.apiUrl;
const OLD_HARDCODED_GUID = ['6ce946c1', '5099', '4fbd', '96e3', 'd1cac747adc7'].join('-');

function capture<T>(source: Observable<T>): { value?: T; error?: unknown } {
  const result: { value?: T; error?: unknown } = {};
  source.subscribe({ next: (v) => (result.value = v), error: (e) => (result.error = e) });
  return result;
}

describe('UserSymbolsService user-id handling', () => {
  let http: HttpTestingController;
  let service: UserSymbolsService;
  let currentUserId = '';

  beforeEach(() => {
    currentUserId = '';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SettingsService, useValue: { getSelectedExchange: () => of({ Id: 3 }) } },
        { provide: AppService, useValue: { getUserId$: () => of(currentUserId) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(UserSymbolsService);
  });

  afterEach(() => http.verify());

  it('getUserSymbolsProfile uses an explicit user id', () => {
    const res = capture(service.getUserSymbolsProfile('user-a'));
    const req = http.expectOne(`${BASE}api/UserSymbols/user-a/profile?exchangeId=3`);
    req.flush([{ Symbol: 'BTC' } as UserSymbolProfile]);
    expect(res.value?.length).toBe(1);
  });

  it('getUserSymbolsProfile uses the AppService user id when none is given', () => {
    currentUserId = 'user-b';
    capture(service.getUserSymbolsProfile());
    http.expectOne(`${BASE}api/UserSymbols/user-b/profile?exchangeId=3`).flush(null);
  });

  it('getUserSymbolsProfile errors and issues no HTTP request when user id is missing', () => {
    const res = capture(service.getUserSymbolsProfile());
    expect((res.error as Error).message).toBe(MISSING_USER_ID_MESSAGE);
    http.expectNone((r) => r.url.includes(OLD_HARDCODED_GUID) || r.url.includes('/profile'));
  });

  it('getUserSymbolsProfileForExchange uses an explicit user id', () => {
    capture(service.getUserSymbolsProfileForExchange(5, 'user-c'));
    http.expectOne(`${BASE}api/UserSymbols/user-c/profile?exchangeId=5`).flush([]);
  });

  it('getUserSymbolsProfileForExchange uses the AppService user id when none is given', () => {
    currentUserId = 'user-d';
    capture(service.getUserSymbolsProfileForExchange(5));
    http.expectOne(`${BASE}api/UserSymbols/user-d/profile?exchangeId=5`).flush([]);
  });

  it('getUserSymbolsProfileForExchange errors and issues no HTTP request when user id is missing', () => {
    const res = capture(service.getUserSymbolsProfileForExchange(5));
    expect((res.error as Error).message).toBe(MISSING_USER_ID_MESSAGE);
    http.expectNone((r) => r.url.includes(OLD_HARDCODED_GUID) || r.url.includes('/profile'));
  });

  it('getUserSymbolsProfileForExchange errors on an explicit empty user id (logged-out caller)', () => {
    const res = capture(service.getUserSymbolsProfileForExchange(5, ''));
    expect((res.error as Error).message).toBe(MISSING_USER_ID_MESSAGE);
    http.expectNone((r) => r.url.includes(OLD_HARDCODED_GUID) || r.url.includes('/profile'));
  });

  it('getUserSymbolsProfile maps a null response to an empty list', () => {
    const res = capture(service.getUserSymbolsProfile('user-e'));
    http.expectOne(`${BASE}api/UserSymbols/user-e/profile?exchangeId=3`).flush(null);
    expect(res.value).toEqual([]);
  });
});
