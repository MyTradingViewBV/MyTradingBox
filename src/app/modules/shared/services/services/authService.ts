import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { first, switchMap } from 'rxjs/operators';
import { AppService } from './appService';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _appService = inject(AppService);

  constructor() {}

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
}
