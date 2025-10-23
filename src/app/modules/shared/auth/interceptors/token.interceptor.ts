import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpSentEvent,
  HttpHeaderResponse,
  HttpProgressEvent,
  HttpResponse,
  HttpUserEvent,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
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
    // if (request.url.includes('/assets/i18n/')) {
    //   return next.handle(request);
    // }

    // // --- 1. SKIP AUTH IF HEADER PRESENT ---
    // if (request.headers.has('Skip-Auth')) {
    //   const newHeaders = request.headers.delete('Skip-Auth');
    //   const cloned = request.clone({ headers: newHeaders });
    //   return next.handle(cloned);
    // }

    // // --- 2. STANDARD TOKEN FLOW ---
    // return this._appService.getLoginResponse().pipe(
    //   first(),
    //   switchMap((loginResponse) => {
    //     if (!loginResponse?.access_token) {
    //       // No token at all
    //       if (window.location.href.includes('/login')) {
    //         return next.handle(request);
    //       } else {
    //         this._appService.logout();
    //         return throwError(
    //           () => new Error('Session expired. Please log in again.'),
    //         );
    //       }
    //     }
    //     // Now check if token is authorized/valid (returns Observable<boolean>)
    //     return this._appService.isAuthorized().pipe(
    //       first(),
    //       switchMap((isAuth) => {
    //         if (!isAuth) {
    //           this._appService.logout();
    //           return throwError(
    //             () => new Error('Session expired. Please log in again.'),
    //           );
    //         }
    //         // Token is valid, proceed as normal
    //         return next.handle(
    //           TokenInterceptor.addTokenToRequest(
    //             request,
    //             loginResponse.access_token,
    //           ),
    //         );
    //       }),
    //     );
    //   }),
    //   catchError((err) => {
    //     if (err instanceof HttpErrorResponse) {
    //       switch (err.status) {
    //         case 404:
    //           return throwError(() => new Error(err.message));
    //         case 400:
    //           if (err?.error?.message) {
    //             return throwError(() => new Error(err.error.message));
    //           } else {
    //             return throwError(() => new Error(err.message));
    //           }
    //       }
    //     }
    //     return throwError(() => new Error(err.message));
    //   }),
    // );
    return next.handle(request);
  }
}
