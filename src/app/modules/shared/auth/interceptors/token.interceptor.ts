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
import { Injectable, inject } from '@angular/core';
import {
  Observable,
  first,
  switchMap,
  throwError,
  catchError,
} from 'rxjs';
import { AppService } from '../../services/services/appService';
import { environment } from 'src/environments/environment';

@Injectable()
export class TokenInterceptor implements HttpInterceptor {
  private readonly _appService = inject(AppService);

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
    // 1. Only our own backend API needs auth. Relative same-origin requests
    // (e.g. 'assets/version.json', i18n files) and external URLs pass through.
    if (!request.url.startsWith(environment.apiUrl)) {
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
          // Match '/login' also under a base href such as '/MyTradingBox/login'.
          if (/\/login(\/|$)/.test(window.location.pathname)) {
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
            return next.handle(
              TokenInterceptor.addTokenToRequest(request, rawToken),
            );
          }),
        );
      }),
      // Only own-API requests reach this point (step 1 passes everything else
      // through), so a 401 here always means our session was rejected.
      catchError((err) => {
        if (err instanceof HttpErrorResponse) {
          switch (err.status) {
            case 400:
              return throwError(
                () => new Error(err?.error?.message || err.message),
              );
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
