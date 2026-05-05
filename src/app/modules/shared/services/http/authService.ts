import { Injectable, inject } from '@angular/core';
import { LoginResponse } from '../../models/login/loginResponse.dto';
import { Observable, throwError } from 'rxjs';
import { LoginDTO } from '../../models/login/login.dto';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { map, catchError } from 'rxjs/operators';

type LoginErrorWithDebug = Error & {
  debugDetails?: Record<string, unknown>;
};

function serializeLoginErrorValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    if (depth >= 4) {
      return '[Max depth reached]';
    }
    return value.map((entry) => serializeLoginErrorValue(entry, depth + 1, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    if (depth >= 4) {
      return '[Max depth reached]';
    }

    seen.add(value);
    const serialized: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      serialized[key] = serializeLoginErrorValue(entryValue, depth + 1, seen);
    }
    return serialized;
  }

  return String(value);
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly _http = inject(HttpClient);

  /**
   * Perform credential login.
   * Attaches Skip-Auth header so TokenInterceptor doesn't require existing token.
   */
  login(loginParams: LoginDTO): Observable<LoginResponse> {
    // Backend expects PascalCase keys and endpoint: api/Auth/login
    const headers = new HttpHeaders({ 'Skip-Auth': 'true' });
    const body: any = {
      Username: loginParams.username,
      Password: loginParams.password,
    };
    if (loginParams.website) {
      body.Website = loginParams.website; // honeypot field
    }

    return this._http
      .post<LoginResponse>(`${environment.apiUrl}api/Auth/login`, body, {
        headers,
      })
      .pipe(
        map((res) => {
          // Basic sanity checks – ensure token present
          if (!res?.AccessToken) {
            throw new Error('Geen token ontvangen');
          }
          // Stamp creation time if backend omitted
          if (!res.CreatedAt) {
            res.CreatedAt = new Date();
          }
          return res;
        }),
        catchError((err) => {
          let message = 'Login mislukt';
          if (err?.status === 401) {
            message = 'Ongeldige gebruikersnaam of wachtwoord';
          } else if (err?.status === 0) {
            message = 'Server niet bereikbaar';
          } else if (err?.error?.message) {
            message = err.error.message;
          }
          const loginError = new Error(message) as LoginErrorWithDebug;
          loginError.name = 'LoginError';
          loginError.debugDetails = {
            status: typeof err?.status === 'number' ? err.status : null,
            statusText: err?.statusText ?? null,
            url: err?.url ?? `${environment.apiUrl}api/Auth/login`,
            message: err?.message ?? null,
            online: typeof navigator !== 'undefined' ? navigator.onLine : null,
            timestamp: new Date().toISOString(),
            error: serializeLoginErrorValue(err?.error),
          };
          return throwError(() => loginError);
        }),
      );
  }
}
