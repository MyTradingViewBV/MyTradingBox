import { Injectable } from '@angular/core';
import { NotificationLogService } from './notificationLog.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  constructor(private _log: NotificationLogService) {}
  private _swAttempted = false;

  private async getOrRegisterSW(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
      this._log.add('Service worker API not available');
      return null;
    }
    try {
      let reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        this._log.add('Found existing service worker registration');
        return reg;
      }
      if (this._swAttempted) {
        this._log.add('Service worker registration previously attempted; skipping');
        return null;
      }
      this._swAttempted = true;
      const candidates = ['ngsw-worker.js', 'service-worker.js'];
      for (const script of candidates) {
        try {
          this._log.add(`Attempting to register ${script}`);
          reg = await navigator.serviceWorker.register(`/${script}`, { scope: '/' });
          if (reg) {
            this._log.add(`Registered service worker: ${script}`);
            return reg;
          }
        } catch (e) {
          this._log.add(`Failed to register ${script}: ${(e as any)?.message}`);
        }
      }
    } catch (e) {
      this._log.add('getOrRegisterSW error: ' + (e as any)?.message);
    }
    return null;
  }

  async requestAndShow(title: string, options?: NotificationOptions): Promise<void> {
    try {
      this._log.add('Notification attempt started');
      if (!('Notification' in window)) {
        this._log.add('Notifications API not supported');
        return;
      }
      if (!(window as any).isSecureContext) {
        this._log.add('Not a secure context (HTTPS required for mobile notifications)');
      }
      // Mobile Safari/Chrome require secure context and a user gesture. Use service worker if available.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this._log.add(`Permission not granted: ${permission}`);
        return;
      }

      // Prefer ServiceWorkerRegistration for better mobile support
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            this._log.add('Showing notification via ServiceWorkerRegistration');
            await reg.showNotification(title, options);
            return;
          }
          this._log.add('No active service worker registration found');
          // Try navigator.serviceWorker.ready as fallback
          try {
            const readyReg = await (navigator.serviceWorker as any).ready;
            if (readyReg) {
              this._log.add('Using serviceWorker.ready registration');
              await readyReg.showNotification(title, options);
              return;
            }
          } catch (e) {
            this._log.add('serviceWorker.ready failed: ' + (e as any)?.message);
          }
          // Attempt to register one now
          const newReg = await this.getOrRegisterSW();
          if (newReg) {
            try {
              this._log.add('Showing notification via newly registered service worker');
              await newReg.showNotification(title, options);
              return;
            } catch (e) {
              this._log.add('New registration showNotification failed: ' + (e as any)?.message);
            }
          }
        } catch {}
      }

      // Fallback to window Notification
      this._log.add('Using window.Notification fallback');
      new Notification(title, options);
    } catch (e) {
      const msg = (e as any)?.message || String(e);
      if (/Illegal constructor|Failed to construct/i.test(msg)) {
        this._log.add('Browser blocked direct Notification constructor. Rely on service worker path.');
      }
      this._log.add('Notification error: ' + msg);
    }
  }
}
