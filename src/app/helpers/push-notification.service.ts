import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private _subscribed = false;

  constructor(private _http: HttpClient) {}

  /** Convert a Base64URL (RFC 7515) string to a Uint8Array */
  private urlBase64ToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }

  /** Request Notification + Push permission and create a push subscription (idempotent). */
  async ensureSubscription(): Promise<PushSubscription | null> {
    if (this._subscribed) return null; // Already attempted
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('[Push] APIs not supported in this browser');
        return null;
      }
      // iOS 16.4+ requires the app to be installed (Add to Home Screen) before permission prompt.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('[Push] Notification permission declined:', permission);
        return null;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        this._subscribed = true;
        return existing;
      }
      if (!environment.vapidPublicKey) {
        console.warn('[Push] Missing VAPID public key in environment');
        return null;
      }
      const appServerKey = this.urlBase64ToUint8Array(environment.vapidPublicKey);
      // Some TS lib versions expect ArrayBuffer instead of a generic Uint8Array<ArrayBufferLike>
      // Use the underlying buffer and cast for compatibility.
      const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey.buffer as ArrayBuffer });
      this._subscribed = true;
      // Send subscription to backend (adjust endpoint path as needed)
      try {
        await this._http.post(environment.apiUrl + 'api/push/subscribe', subscription).toPromise();
      } catch (e) {
        console.warn('[Push] Failed to persist subscription on backend', e);
      }
      return subscription;
    } catch (e) {
      console.error('[Push] Subscription failed', e);
      return null;
    }
  }
}