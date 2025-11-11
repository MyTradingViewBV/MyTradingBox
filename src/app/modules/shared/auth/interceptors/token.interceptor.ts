import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpSentEvent,
  HttpHeaderResponse,
  HttpProgressEvent,
  HttpResponse,
  HttpUserEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, first, switchMap, throwError, catchError } from 'rxjs';
import { AppService } from '../../services/services/appService';

@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  isRefreshingToken = false;
  tokenSubject: BehaviorSubject<string> = new BehaviorSubject<string>('');

  constructor(private _appService: AppService) {}

  static addTokenToRequest(
    request: HttpRequest<unknown>,
    token: string,
  ): HttpRequest<unknown> {
    return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler,
  ): Observable<
    | HttpSentEvent
    | HttpHeaderResponse
    | HttpProgressEvent
    | HttpResponse<unknown>
    | HttpUserEvent<unknown>
    | never
  > {
    // 1. Skip auth for translation & static asset calls
    if (request.url.includes('/assets/i18n/') || request.url.includes('/assets/')) {
      return next.handle(request);
    }

    // 2. Explicit skip header support (e.g. for login endpoint in future)
    if (request.headers.has('Skip-Auth')) {
      const newHeaders = request.headers.delete('Skip-Auth');
      return next.handle(request.clone({ headers: newHeaders }));
    }

    // 3. Attach token if present & valid
    return this._appService.getLoginResponse().pipe(
      first(),
      switchMap((loginResponse) => {
        const rawToken = loginResponse?.AccessToken;
        if (!rawToken) {
          // No token: if already on login allow request (e.g. login call), else force logout
          if (window.location.pathname.startsWith('/login')) {
            return next.handle(request);
          }
          this._appService.logout();
          return throwError(() => new Error('Not authenticated'));
        }
        // Validate token using service (decoding + expiry checks)
        return this._appService.isAuthorized().pipe(
          first(),
          switchMap((isAuth) => {
            if (!isAuth) {
              this._appService.logout();
              return throwError(() => new Error('Session expired'));
            }
            return next.handle(TokenInterceptor.addTokenToRequest(request, rawToken));
          }),
        );
      }),
      catchError((err) => {
        if (err instanceof HttpErrorResponse) {
          switch (err.status) {
            case 400:
              return throwError(() => new Error(err?.error?.message || err.message));
            case 401:
              this._appService.logout();
              return throwError(() => new Error('Unauthorized'));
            case 404:
              return throwError(() => new Error('Not found'));
          }
        }
        return throwError(() => err);
      }),
    );
  }
}
