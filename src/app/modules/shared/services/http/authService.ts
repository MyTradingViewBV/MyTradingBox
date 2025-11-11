import { Injectable } from '@angular/core';
import { LoginResponse } from '../../models/login/loginResponse.dto';
import { Observable, throwError } from 'rxjs';
import { LoginDTO } from '../../models/login/login.dto';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  constructor(private _http: HttpClient) {}

  /**
   * Perform credential login.
   * Attaches Skip-Auth header so TokenInterceptor doesn't require existing token.
   */
  login(loginParams: LoginDTO): Observable<LoginResponse> {
    // Backend expects PascalCase keys and endpoint: api/Auth/login
    const headers = new HttpHeaders({ 'Skip-Auth': 'true' });
    const body = {
      Username: loginParams.username,
      Password: loginParams.password,
    };

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
          return throwError(() => new Error(message));
        }),
      );
  }
}
