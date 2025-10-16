import { Injectable } from '@angular/core';
import { LoginResponse } from '../models/LoginResponse.dto';
import { Store, Action } from '@ngrx/store';
import { AppActions } from '../../../store/app.actions';
import { appFeature, AppState } from '../../../store/app.reducer';
import { first, map, Observable } from 'rxjs';
import { Router } from '@angular/router';
import { jwtDecode } from 'jwt-decode';
import { Exchange } from '../models/TradeOrders.dto';
import { SymbolModel } from './market.service';

@Injectable({
  providedIn: 'root',
})
export class AppService {
  constructor(
    private _appStore: Store<AppState>,
    private _router: Router,
  ) {}

  public isAuthorized(): Observable<boolean> {
    return this.getAppState().pipe(
      first(),
      map((authState) => {
        const accessToken = authState?.token?.access_token;
        if (!accessToken) {
          console.warn('[isAuthorized] No access_token found!');
          return false;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let decoded: any;
        try {
          decoded = jwtDecode(accessToken);
          console.log('[isAuthorized] Decoded JWT:', decoded);
        } catch (e) {
          console.error('[isAuthorized] Failed to decode JWT:', e);
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

  getSelectedCurrency(): Observable<string | null> {
    return this._appStore.select(appFeature.selectCurrency);
  }

  getSelectedSymbol(): Observable<SymbolModel | null> {
    return this._appStore.select(appFeature.selectSymbol);
  }

  getSelectedExchange(): Observable<Exchange | null> {
    return this._appStore.select(appFeature.selectExchange);
  }

  clearAllStates(): void {
    this.clearAppState();
  }

  logout(): void {
    this.clearAllStates();
    this._router.navigate(['/login']);
  }
}
