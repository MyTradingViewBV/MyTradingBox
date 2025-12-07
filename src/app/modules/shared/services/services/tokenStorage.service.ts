import { Injectable } from '@angular/core';
import { LoginResponse } from '../../models/login/loginResponse.dto';
import { appFeature } from '../../../../store/app/app.reducer';
import { Store } from '@ngrx/store';
import { first, Observable } from 'rxjs';

/**
 * TokenStorageService
 * Provides a single place to read/write/clear the auth token.
 * Prefers NgRx store (rehydrated via localStorageSync) but exposes
 * direct localStorage access if ever needed outside NgRx lifecycle.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  // Token persistence flows through NgRx localStorageSync; avoid direct storage.

  constructor(private _store: Store) {}

  getToken$(): Observable<LoginResponse | null> {
    return this._store.select(appFeature.selectToken).pipe(first());
  }

  // Remove direct localStorage helpers to enforce NgRx-only usage
  // Token clearing should dispatch an action handled by reducers/effects
}
