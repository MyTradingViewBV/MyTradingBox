import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AppService } from './appService';
import { LoginResponse } from '../../models/login/loginResponse.dto';

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
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        AccessToken: 'header.payload.signature',
        ExpiresIn: '',
        CreatedAt: new Date().toISOString(),
      }),
    );

    const hydratedService = TestBed.runInInjectionContext(() => new AppService());

    expect(dispatch).toHaveBeenCalled();
    expect(hydratedService).toBeTruthy();
  });

  it('removes malformed stored authentication data', () => {
    localStorage.setItem(storageKey, '{invalid');

    TestBed.runInInjectionContext(() => new AppService());

    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});