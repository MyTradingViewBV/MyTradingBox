import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { first, switchMap } from 'rxjs/operators';
import { AppService } from './appService';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private _appService: AppService) {}

  /** Returns a valid access token, or throws if unauthenticated/expired */
  async getValidAccessToken(): Promise<string> {
    const token$ = this._appService
      .getLoginResponse()
      .pipe(
        first(),
        switchMap((loginResponse: any) => {
          const rawToken = loginResponse?.AccessToken as string | undefined;
          if (!rawToken) {
            // Mirror interceptor behavior: logout on missing token
            this._appService.logout();
            throw new Error('Not authenticated');
          }
          return this._appService
            .isAuthorized()
            .pipe(
              first(),
              switchMap((isAuth: boolean) => {
                if (!isAuth) {
                  this._appService.logout();
                  throw new Error('Session expired');
                }
                // Return token as observable
                return [rawToken] as any;
              }),
            );
        }),
      );

    const token = await firstValueFrom(token$ as any);
    return token as string;
  }
  /** Fetches VAPID public key from API or environment override */
  async getVapidPublicKey(): Promise<string> {
    let publicKey = (environment.vapidPublicKey || '').trim();
    if (publicKey && publicKey !== 'REPLACE_WITH_YOUR_PUBLIC_VAPID_KEY') {
      return publicKey;
    }

    const apiBase = (environment.apiUrl || '').replace(/\/+$/, '');
    const vapidUrl = `${apiBase}/api/notifications/webpush/vapid-key`;
    const resp = await fetch(vapidUrl);
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Failed to fetch VAPID key: ${resp.status} ${txt}`);
    }
    const json = (await resp.json()) as { PublicKey?: string };
    return (json.PublicKey || '').trim();
  }

  /** Sends a Web Push subscription to the backend API */
  async subscribeWebPush(
    payload: { endpoint: string; p256dh: string; auth: string; tags: string[] },
    accessToken: string,
  ): Promise<void> {
    if (!accessToken) {
      throw new Error('Missing access token for subscribe request');
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };

    const apiBase = (environment.apiUrl || '').replace(/\/+$/, '');
    const subscribeUrl = `${apiBase}/api/notifications/webpush/subscribe`;

    const resp = await fetch(subscribeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new Error(`Subscribe failed: ${resp.status} ${txt}`);
    }
  }
}
