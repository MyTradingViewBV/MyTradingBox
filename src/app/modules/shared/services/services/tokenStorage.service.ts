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
  private LS_KEY = 'appState'; // persisted root key (encrypted via metaReducer)

  constructor(private _store: Store) {}

  getToken$(): Observable<LoginResponse | null> {
    return this._store.select(appFeature.selectToken).pipe(first());
  }

  /**
   * Fallback raw localStorage read (encrypted blob unless metaReducer changes).
   * Not recommended for routine use; prefer getToken$.
   */
  getRawPersistedState(): string | null {
    return localStorage.getItem(this.LS_KEY);
  }

  clearToken(): void {
    // Clearing store token handled by AppService.logout(); this is a direct wipe.
    localStorage.removeItem(this.LS_KEY);
  }
}
