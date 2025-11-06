import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpHandler, HttpRequest, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
// import { Router } from '@angular/router';
// import { TranslateService } from '@ngx-translate/core';
// import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  // constructor(
  //   // private _router: Router,
  //   // private _snackbar: MatSnackBar,
  //   // private _translate: TranslateService
  // ) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        console.log('HTTP error occurred:', error);

        // Log the custom header 'X-Calling-Function'
        const callingFunction = request.headers.get('X-Calling-Function');
        if (callingFunction) {
          console.log('Calling Function (X-Calling-Function):', callingFunction);
        } else {
          console.log('Calling Function header not present in the request.');
        }

        // if (error.status === 400) {
        //   // Handle bad request error
        //   //this._snackbar.open(this._translate.instant('ERROR.BAD_REQUEST') + ': ' + error.message);
        // } else if (error.status === 401) {
        //   // Handle unauthorized error
        //   // Redirect to login page
        //   this._snackbar.open(this._translate.instant('ERROR.UNAUTHORIZED') + ': ' + error.message);
        //   this._router.navigate(['/login']);
        // } else if (error.status === 403) {
        //   // Handle forbidden error
        //   this._snackbar.open(this._translate.instant('ERROR.FORBIDDEN') + ': ' + error.message);
        // } else if (error.status === 404) {
        //   // Handle not found error
        //   this._snackbar.open(this._translate.instant('ERROR.NOT_FOUND') + ': ' + error.message);
        // } else if (error.status === 408) {
        //   // Handle request timeout error
        //   this._snackbar.open(this._translate.instant('ERROR.TIMEOUT') + ': ' + error.message);
        // } else if (error.status === 500) {
        //   // Handle internal server error
        //   this._snackbar.open(this._translate.instant('ERROR.INTERNAL_SERVER') + ': ' + error.message);
        // } else if (error.status === 503) {
        //   // Handle service unavailable error
        //   this._snackbar.open(this._translate.instant('ERROR.SERVICE_UNAVAILABLE') + ': ' + error.message);
        //   this._router.navigate(['/login']);
        // } else {
        //   // Handle other errors
        //   this._snackbar.open(this._translate.instant('ERROR.GENERIC') + ': ' + error.message);
        // }
        // Rethrow the error after handling
        return throwError(() => error);
      })
    );
  }
}
