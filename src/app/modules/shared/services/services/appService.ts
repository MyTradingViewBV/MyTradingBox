import { Injectable } from '@angular/core';
import { LoginResponse } from '../../models/login/loginResponse.dto';
import { Store, Action } from '@ngrx/store';
import { AppActions } from '../../../../store/app/app.actions';
import { appFeature, AppState } from '../../../../store/app/app.reducer';
import { first, map, Observable } from 'rxjs';
import { Router } from '@angular/router';
import { extractExpiry, isTokenExpired } from '../../utils/token-expiry.util';

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

    const { expiryTimestamp } = extractExpiry(token);
    if (expiryTimestamp && expiryTimestamp > Date.now()) {
      const delay = expiryTimestamp - Date.now() + 500; // small buffer
      this.logoutTimer = setTimeout(() => {
        console.info('[handleNewLoginToken] Token expired – auto logout');
        this.logout();
      }, delay);
    }
  }
}
