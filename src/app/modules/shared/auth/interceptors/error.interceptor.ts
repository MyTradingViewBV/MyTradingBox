import { Injectable, inject } from '@angular/core';
import { HttpInterceptor, HttpHandler, HttpRequest, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { ToastService } from 'src/app/helpers/toast.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private readonly _toast = inject(ToastService);
  private readonly _translate = inject(TranslateService);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 403) {
          const msg = this._translate.instant('ERROR.FORBIDDEN');
          this._toast.error(msg);
        }
        return throwError(() => error);
      })
    );
  }
}
