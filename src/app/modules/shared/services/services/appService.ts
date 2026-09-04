import { Injectable, inject } from '@angular/core';
import { LoginResponse } from '../../models/login/loginResponse.dto';
import { Store, Action } from '@ngrx/store';
import { AppActions } from '../../../../store/app/app.actions';
import { appFeature, AppState } from '../../../../store/app/app.reducer';
import { first, map, Observable } from 'rxjs';
import { Router } from '@angular/router';
import {
  extractExpiry,
  isTokenExpired,
  isAdminToken,
  getEmailFromToken,
  getUserIdFromToken,
} from '../../utils/token-expiry.util';

@Injectable({
  providedIn: 'root',
})
export class AppService {
  private static readonly authStorageKey = 'mtb.auth.session';
  private logoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _appStore = inject(Store<AppState>);
  private readonly _router = inject(Router);

  constructor() {
    this.restoreStoredLogin();
  }

  public isAuthorized(): Observable<boolean> {
    return this.getAppState().pipe(
      first(),
      map((state) => {
        const token = state?.token;
        if (!token?.AccessToken) {
          return false;
        }
        if (isTokenExpired(token)) {
          console.info('[isAuthorized] Token expired');
          this.logout();
          return false;
        }
        return true;
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
    this.removeStoredLogin();
    this._appStore.dispatch(AppActions.clear());
  }

  getLoginResponse(): Observable<LoginResponse | null> {
    return this._appStore.select(appFeature.selectToken);
  }

  isAdmin(): Observable<boolean> {
    return this.getLoginResponse().pipe(
      first(),
      map((token) => (token ? isAdminToken(token) : false)),
    );
  }

  getUserEmail(): Observable<string> {
    return this.getLoginResponse().pipe(
      first(),
      map((token) => (token ? getEmailFromToken(token) : '')),
    );
  }

  getUserId$(): Observable<string> {
    return this.getLoginResponse().pipe(
      first(),
      map((token) => (token ? getUserIdFromToken(token) : '')),
    );
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
    this.removeStoredLogin();
    this.clearAllStates();
    this._router.navigate(['/login']);
  }

  /**
   * Handles a freshly received login token: persists it and schedules auto logout.
   * Also clears old localStorage data when switching between accounts.
   */
  handleNewLoginToken(token: LoginResponse): void {
    // Persist token to store
    this.dispatchAppAction(AppActions.setToken({ token }));
    this.storeLogin(token);

    // Clear previous timer
    if (this.logoutTimer) {
      clearTimeout(this.logoutTimer);
      this.logoutTimer = null;
    }

    this.scheduleLogout(token);
  }

  private restoreStoredLogin(): void {
    try {
      const stored = localStorage.getItem(AppService.authStorageKey);
      if (!stored) return;

      const parsed = JSON.parse(stored) as Partial<LoginResponse>;
      if (typeof parsed.AccessToken !== 'string' || !parsed.AccessToken.trim()) {
        this.removeStoredLogin();
        return;
      }

      const token = new LoginResponse();
      token.AccessToken = parsed.AccessToken;
      token.ExpiresIn = typeof parsed.ExpiresIn === 'string' ? parsed.ExpiresIn : '';
      token.CreatedAt = parsed.CreatedAt ? new Date(parsed.CreatedAt) : new Date();

      if (isTokenExpired(token)) {
        this.removeStoredLogin();
        return;
      }

      this.dispatchAppAction(AppActions.setToken({ token }));
      this.scheduleLogout(token);
    } catch {
      this.removeStoredLogin();
    }
  }

  private storeLogin(token: LoginResponse): void {
    try {
      localStorage.setItem(
        AppService.authStorageKey,
        JSON.stringify({
          AccessToken: token.AccessToken,
          ExpiresIn: token.ExpiresIn,
          CreatedAt: token.CreatedAt,
        }),
      );
    } catch {
      // Authentication remains available in memory if storage is unavailable.
    }
  }

  private removeStoredLogin(): void {
    try {
      localStorage.removeItem(AppService.authStorageKey);
    } catch {
      // Storage can be unavailable in private browsing.
    }
  }

  private scheduleLogout(token: LoginResponse): void {
    const { expiryTimestamp } = extractExpiry(token);
    if (expiryTimestamp && expiryTimestamp > Date.now()) {
      const delay = expiryTimestamp - Date.now() + 500;
      this.logoutTimer = setTimeout(() => {
        console.info('[handleNewLoginToken] Token expired – auto logout');
        this.logout();
      }, delay);
    }
  }
}
