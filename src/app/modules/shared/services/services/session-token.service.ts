import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AppService } from './appService';
import { environment } from 'src/environments/environment';

interface VapidKeyResponse {
  PublicKey?: string;
}

/** Access-token validation and Web Push (VAPID) key lookup for the current session. */
@Injectable({ providedIn: 'root' })
export class SessionTokenService {
  private readonly _appService = inject(AppService);
  private readonly _http = inject(HttpClient);

  /** Returns a valid access token, or throws if unauthenticated/expired */
  async getValidAccessToken(): Promise<string> {
    const loginResponse = await firstValueFrom(
      this._appService.getLoginResponse(),
    );
    const rawToken = loginResponse?.AccessToken;
    if (!rawToken) {
      // Mirror interceptor behavior: logout on missing token
      this._appService.logout();
      throw new Error('Not authenticated');
    }

    const isAuth = await firstValueFrom(this._appService.isAuthorized());
    if (!isAuth) {
      this._appService.logout();
      throw new Error('Session expired');
    }
    return rawToken;
  }

  /** Fetches VAPID public key from API or environment override */
  async getVapidPublicKey(): Promise<string> {
    const publicKey = (environment.vapidPublicKey || '').trim();
    if (publicKey && publicKey !== 'REPLACE_WITH_YOUR_PUBLIC_VAPID_KEY') {
      return publicKey;
    }

    const apiBase = (environment.apiUrl || '').replace(/\/+$/, '');
    const vapidUrl = `${apiBase}/api/notifications/webpush/vapid-key`;
    // The VAPID key endpoint is public; skip bearer-token handling.
    const headers = new HttpHeaders({ 'Skip-Auth': 'true' });
    try {
      const json = await firstValueFrom(
        this._http.get<VapidKeyResponse>(vapidUrl, { headers }),
      );
      return (json?.PublicKey || '').trim();
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse) {
        const detail =
          typeof err.error === 'string' ? err.error : err.statusText || '';
        throw new Error(`Failed to fetch VAPID key: ${err.status} ${detail}`);
      }
      throw err;
    }
  }
}
