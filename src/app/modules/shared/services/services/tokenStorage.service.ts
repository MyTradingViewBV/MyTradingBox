import { Injectable, inject } from '@angular/core';
import { LoginResponse } from '../../models/login/loginResponse.dto';
import { appFeature } from '../../../../store/app/app.reducer';
import { Store } from '@ngrx/store';
import { first, Observable } from 'rxjs';

/**
 * TokenStorageService
 * Provides a single place to read/write/clear the auth token.
 * Reads the in-memory NgRx token state without browser persistence.
 */
@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  // Token clearing should dispatch an action handled by reducers/effects.
  private readonly _store = inject(Store);

  constructor() {}

  getToken$(): Observable<LoginResponse | null> {
    return this._store.select(appFeature.selectToken).pipe(first());
  }

}
