import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { AuthService } from 'src/app/modules/shared/services/services/authService';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private _subscribed = false;
  private readonly _http = inject(HttpClient);
  private readonly _auth = inject(AuthService);

  constructor() {}

  /** Convert a Base64URL (RFC 7515) string to a Uint8Array */
  private urlBase64ToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }

  private isIosDevice(): boolean {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/i.test(ua);
  }

  private isStandalone(): boolean {
    const nav = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
  }

  /**
   * iOS requires the permission prompt to happen directly from a user gesture.
   * Call this from click/tap handlers (for example login button) before async hops.
   */
  async primePermissionFromUserGesture(): Promise<NotificationPermission | 'unsupported' | 'not-installed-ios'> {
    if (environment.disablePush) return Notification.permission;

    if (!('Notification' in window)) {
      return 'unsupported';
    }

    if (Notification.permission !== 'default') {
      return Notification.permission;
    }

    if (this.isIosDevice() && !this.isStandalone()) {
      console.warn('[Push] iOS push permission requires Add to Home Screen installation.');
      return 'not-installed-ios';
    }

    return Notification.requestPermission();
  }

  /** Request Notification + Push permission and create a push subscription (idempotent). */
  async ensureSubscription(): Promise<PushSubscription | null> {
    // Temporary kill-switch to disable push feature
    if (environment.disablePush) {
      console.warn('[Push] Disabled via environment flag');
      return null;
    }
    if (this._subscribed) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          await this.persistSubscriptionToBackend(existing);
          return existing;
        }
      } catch {}
      return null;
    }
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[Push] APIs not supported in this browser');
        return null;
      }
      if (Notification.permission === 'default' && this.isIosDevice() && !this.isStandalone()) {
        console.warn('[Push] iOS push requires standalone installation (Add to Home Screen).');
        return null;
      }
      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;
      if (permission !== 'granted') {
        console.warn('[Push] Notification permission declined:', permission);
        return null;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        this._subscribed = true;
        await this.persistSubscriptionToBackend(existing);
        return existing;
      }
      // Resolve VAPID public key (try environment first then backend)
      let publicKey = (environment.vapidPublicKey || '').trim();
      if (!publicKey || publicKey === 'REPLACE_WITH_YOUR_PUBLIC_VAPID_KEY') {
        try {
          publicKey = await this._auth.getVapidPublicKey();
        } catch (err) {
          console.warn('[Push] Missing VAPID public key in environment and failed to fetch from API', err);
          return null;
        }
      }

      const appServerKey = this.urlBase64ToUint8Array(publicKey);
      // Convert to a plain ArrayBuffer for compatibility with various TS lib expectations
      const applicationServerKey = appServerKey.buffer.slice(appServerKey.byteOffset, appServerKey.byteOffset + appServerKey.byteLength) as ArrayBuffer;
      const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      this._subscribed = true;
      await this.persistSubscriptionToBackend(subscription);

      return subscription;
    } catch (e) {
      console.error('[Push] Subscription failed', e);
      return null;
    }
  }

  private async persistSubscriptionToBackend(
    subscription: PushSubscription,
  ): Promise<void> {
    try {
      const apiBase = (environment.apiUrl || '').replace(/\/+$/, '');
      const subscribeUrl = `${apiBase}/api/notifications/webpush/subscribe`;
      const endpoint = subscription.endpoint;
      const p256dh = this.arrayBufferKeyToBase64(subscription.getKey('p256dh'));
      const authKey = this.arrayBufferKeyToBase64(subscription.getKey('auth'));

      // Attach access token when available; backend can still accept unauthenticated flow if configured
      let token: string | undefined;
      try {
        token = await this._auth.getValidAccessToken();
      } catch {}

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await firstValueFrom(
        this._http.post(
          subscribeUrl,
          { endpoint, p256dh, auth: authKey, tags: [] },
          { headers },
        ),
      );
    } catch (e) {
      console.warn('[Push] Failed to persist subscription on backend', e);
    }
  }

  private arrayBufferKeyToBase64(key: ArrayBuffer | null): string {
    if (!key) return '';
    const bytes = new Uint8Array(key);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}