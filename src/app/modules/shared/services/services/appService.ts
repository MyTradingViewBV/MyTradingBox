import { Injectable } from '@angular/core';
import { LoginResponse } from '../../models/login/loginResponse.dto';
import { Store, Action } from '@ngrx/store';
import { AppActions } from '../../../../store/app/app.actions';
import { appFeature, AppState } from '../../../../store/app/app.reducer';
import { first, map, Observable } from 'rxjs';
import { Router } from '@angular/router';
import { jwtDecode } from 'jwt-decode';

@Injectable({
  providedIn: 'root',
})
export class AppService {
  private logoutTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private _appStore: Store<AppState>,
    private _router: Router,
  ) {}

  public isAuthorized(): Observable<boolean> {
    return this.getAppState().pipe(
      first(),
      map((authState) => {
        const accessToken = authState?.token?.AccessToken;
        if (!accessToken) {
          console.warn('[isAuthorized] No AccessToken found!');
          return false;
        }
        // --- JWT heuristic: only attempt decode if token has 2 dots (header.payload.signature)
        const looksLikeJwt = accessToken.split('.').length === 3;

        if (looksLikeJwt) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let decoded: any;
          try {
            decoded = jwtDecode(accessToken);
            const exp = decoded?.exp; // seconds since epoch
            if (exp && Date.now() >= exp * 1000) {
              console.warn('[isAuthorized] JWT expired');
              this.logout();
              return false;
            }
          } catch (e) {
            console.error('[isAuthorized] Failed to decode JWT:', e);
            this.logout();
            return false;
          }
        } else {
          // Non-JWT placeholder tokens accepted (e.g., dev stub) but could add length checks
          if (accessToken.length < 1) {
            console.warn('[isAuthorized] Token too short – treating as invalid');
            this.logout();
            return false;
          }
        }

        // Secondary expiry based on LoginResponse.expires_in (if present)
        const createdAt = authState?.token?.CreatedAt;
        const expiresIn = authState?.token?.ExpiresIn; // may be empty string
        if (createdAt && expiresIn) {
          const expiresMs = new Date(createdAt).getTime() + Number(expiresIn) * 1000;
          if (!Number.isNaN(expiresMs) && Date.now() > expiresMs) {
            console.warn('[isAuthorized] Token expired via expires_in');
            this.logout();
            return false;
          }
        }
        return true; // All checks passed
      }),
    );
  }

  dispatchAppAction(action: Action): void {
    this._appStore.dispatch(action);
  }

  getAppState(): Observable<AppState> {
    return this._appStore.select(appFeature.selectAppStateState);
  }

  clearAppState(): void {
    this._appStore.dispatch(AppActions.clear());
  }

  getLoginResponse(): Observable<LoginResponse | null> {
    return this._appStore.select(appFeature.selectToken);
  }

  clearAllStates(): void {
    this.clearAppState();
  }

  logout(): void {
    // Clear any pending auto-logout timer
    if (this.logoutTimer) {
      clearTimeout(this.logoutTimer);
      this.logoutTimer = null;
    }
    this.clearAllStates();
    this._router.navigate(['/login']);
  }

  /**
   * Handles a freshly received login token: persists it and schedules auto logout.
   */
  handleNewLoginToken(token: LoginResponse): void {
    // Persist token to store
    this.dispatchAppAction(AppActions.setToken({ token }));

    // Clear previous timer
    if (this.logoutTimer) {
      clearTimeout(this.logoutTimer);
      this.logoutTimer = null;
    }

    const accessToken = token.AccessToken;
    let expiryTs: number | null = null;

    // 1. Prefer JWT exp claim if token looks like JWT
    if (accessToken && accessToken.split('.').length === 3) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const decoded: any = jwtDecode(accessToken);
        if (decoded?.exp) {
          expiryTs = decoded.exp * 1000; // exp is in seconds
        }
      } catch (e) {
        console.warn('[handleNewLoginToken] Failed to decode JWT for scheduling', e);
      }
    }

    // 2. Fallback to ExpiresIn + CreatedAt if available and no exp claim
    if (!expiryTs && token.ExpiresIn) {
      const createdAtMs = token.CreatedAt ? new Date(token.CreatedAt).getTime() : Date.now();
      const expiresInSec = Number(token.ExpiresIn);
      if (!Number.isNaN(expiresInSec)) {
        expiryTs = createdAtMs + expiresInSec * 1000;
      }
    }

    // Schedule logout slightly after expiry (add small buffer of 500ms)
    if (expiryTs && expiryTs > Date.now()) {
      const delay = expiryTs - Date.now() + 500;
      this.logoutTimer = setTimeout(() => {
        console.info('[handleNewLoginToken] Token expired – auto logout');
        this.logout();
      }, delay);
    }
  }
}
