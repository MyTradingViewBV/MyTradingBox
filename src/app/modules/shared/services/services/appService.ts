import { Injectable, Injector, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { PushNotificationService } from 'src/app/helpers/push-notification.service';
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
  private logoutTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _appStore = inject(Store<AppState>);
  private readonly _router = inject(Router);
  private readonly _injector = inject(Injector);

  constructor() {
    this.armLogoutForHydratedSession();
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
    // Best-effort server-side cleanup. It is started BEFORE the auth state is
    // cleared (it captures the token it needs) but never awaited or allowed to
    // throw, so the local logout below always completes.
    try {
      this.revokeSessionBestEffort();
    } catch (err) {
      console.warn('[logout] Session cleanup failed:', err);
    }
    this.clearAllStates();
    this._router.navigate(['/login']);
  }

  /**
   * Revokes the refresh token server-side and drops the Web Push subscription.
   * The refresh token only lives in memory (it is not persisted), so after a
   * page reload there is nothing to revoke and that call is skipped.
   */
  private revokeSessionBestEffort(): void {
    let token = null as LoginResponse | null;
    this._appStore
      .select(appFeature.selectToken)
      .pipe(first())
      .subscribe((t) => (token = t))
      .unsubscribe();

    const accessToken = token?.AccessToken;
    const refreshToken = token?.RefreshToken;
    if (accessToken && refreshToken && !isTokenExpired(token!)) {
      try {
        // Skip-Auth + explicit header: a 401 here must not re-enter logout().
        this._injector
          .get(HttpClient)
          .post(
            `${environment.apiUrl}api/Auth/logout`,
            { RefreshToken: refreshToken },
            {
              headers: new HttpHeaders({
                'Skip-Auth': 'true',
                Authorization: `Bearer ${accessToken}`,
              }),
            },
          )
          .subscribe({
            error: (err) =>
              console.warn('[logout] Server logout failed:', err),
          });
      } catch (err) {
        console.warn('[logout] Server logout failed:', err);
      }
    }

    try {
      // Resolved lazily: PushNotificationService itself depends on AppService.
      void this._injector
        .get(PushNotificationService)
        .unsubscribe(accessToken && !isTokenExpired(token!) ? accessToken : undefined)
        .catch((err) => console.warn('[logout] Push unsubscribe failed:', err));
    } catch (err) {
      console.warn('[logout] Push unsubscribe failed:', err);
    }
  }

  /**
   * Handles a freshly received login token: stores it (the persistence
   * meta-reducer writes it to localStorage) and schedules auto logout.
   */
  handleNewLoginToken(token: LoginResponse): void {
    // Persist token to store
    this.dispatchAppAction(AppActions.setToken({ token }));

    // Clear previous timer
    if (this.logoutTimer) {
      clearTimeout(this.logoutTimer);
      this.logoutTimer = null;
    }

    this.scheduleLogout(token);
  }

  /**
   * The persistence meta-reducer hydrates a still-valid session into the store
   * at startup (expired/opaque/malformed tokens are discarded there, fail-closed).
   * Here we only (re)arm the auto-logout for a hydrated session.
   */
  private armLogoutForHydratedSession(): void {
    this._appStore
      .select(appFeature.selectToken)
      .pipe(first())
      .subscribe((token) => {
        if (!token?.AccessToken) return;
        if (isTokenExpired(token)) {
          this.clearAppState();
          return;
        }
        this.scheduleLogout(token);
      });
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
