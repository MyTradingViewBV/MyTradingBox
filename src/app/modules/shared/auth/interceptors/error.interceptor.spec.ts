import { TestBed } from '@angular/core/testing';
import {
  HTTP_INTERCEPTORS,
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { importProvidersFrom } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToastMessage, ToastService } from 'src/app/helpers/toast.service';
import { ErrorInterceptor } from './error.interceptor';

describe('ErrorInterceptor', () => {
  const url = 'https://mytradingbox.com/Admin/logs';
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toasts: ToastMessage[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        importProvidersFrom(TranslateModule.forRoot()),
        { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { ERROR: { FORBIDDEN: 'You are not allowed to do this' } });
    translate.use('en');
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    toasts = [];
    TestBed.inject(ToastService).toast$.subscribe((t) => toasts.push(t));
  });

  afterEach(() => httpMock.verify());

  function failWith(status: number): unknown {
    let error: unknown;
    http.get(url).subscribe({ error: (e) => (error = e) });
    httpMock.expectOne(url).flush(null, { status, statusText: 'Error' });
    return error;
  }

  it('shows a translated "forbidden" error toast on 403 and still propagates the error', () => {
    const error = failWith(403);

    expect(toasts).toEqual([
      expect.objectContaining({ text: 'You are not allowed to do this', type: 'error' }),
    ]);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(403);
  });

  it.each([400, 401, 404, 500])('does not toast on %s', (status) => {
    const error = failWith(status);

    expect(toasts).toEqual([]);
    expect((error as HttpErrorResponse).status).toBe(status);
  });

  it('passes successful responses through untouched', () => {
    let body: unknown;
    http.get(url).subscribe((b) => (body = b));
    httpMock.expectOne(url).flush({ lines: [] });

    expect(body).toEqual({ lines: [] });
    expect(toasts).toEqual([]);
  });
});
