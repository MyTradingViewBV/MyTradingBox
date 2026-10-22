import { Injectable, inject } from '@angular/core';
import { HttpInterceptor, HttpHandler, HttpRequest, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { ToastService } from 'src/app/helpers/toast.service';
import { environment } from 'src/environments/environment';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private readonly _toast = inject(ToastService);
  private readonly _translate = inject(TranslateService);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        // Only our own API: a 403 from a third-party service is not a permission problem of the user.
        if (error.status === 403 && request.url.startsWith(environment.apiUrl)) {
          const msg = this._translate.instant('ERROR.FORBIDDEN');
          this._toast.error(msg);
        }
        return throwError(() => error);
      })
    );
  }
}
