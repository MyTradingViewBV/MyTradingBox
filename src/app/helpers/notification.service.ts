import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  async requestAndShow(title: string, options?: NotificationOptions): Promise<void> {
    try {
      if (!('Notification' in window)) {
        console.warn('Notifications not supported in this browser');
        return;
      }
      // Mobile Safari/Chrome require secure context and a user gesture. Use service worker if available.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission not granted:', permission);
        return;
      }

      // Prefer ServiceWorkerRegistration for better mobile support
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.showNotification(title, options);
            return;
          }
        } catch {}
      }

      // Fallback to window Notification
      new Notification(title, options);
    } catch (e) {
      console.warn('Notification error', e);
    }
  }
}
