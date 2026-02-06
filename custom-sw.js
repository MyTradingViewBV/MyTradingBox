// Custom Service Worker that extends Angular's ngsw-worker
// Ensures push notifications are displayed and clicks focus the app

// Import Angular service worker so caching/offline still works
importScripts('./ngsw-worker.js');

async function broadcastToClients(message) {
  try {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      try {
        c.postMessage(message);
      } catch {}
    }
  } catch {}
}

self.addEventListener('push', (event) => {
  try {
    console.log('[SW] push event received');
  } catch {}

  const toAbsoluteUrl = (u) => {
    try {
      if (!u) return u;
      // Android Chrome can be picky with relative icon/badge paths.
      return new URL(u, self.registration.scope).toString();
    } catch {
      return u;
    }
  };

  const parsePayload = async () => {
    if (!event.data) return {};
    try {
      // Prefer text() then JSON.parse for broader compatibility
      const txt = await event.data.text();
      if (!txt) return {};
      try {
        return JSON.parse(txt);
      } catch {
        return { title: 'Notification', body: txt };
      }
    } catch {
      // Some browsers support json() reliably
      try {
        return event.data.json();
      } catch {
        return {};
      }
    }
  };

  event.waitUntil(
    (async () => {
      const data = await parsePayload();
      try {
        console.log('[SW] push payload keys:', Object.keys(data || {}));
      } catch {}

      await broadcastToClients({
        type: 'mtb-sw-push',
        ts: Date.now(),
        hasData: !!data && Object.keys(data || {}).length > 0,
        keys: (() => {
          try {
            return Object.keys(data || {});
          } catch {
            return [];
          }
        })(),
      });

      const title =
        data?.title || data?.notification?.title || 'New notification';
      const body = data?.body || data?.notification?.body || ' '; // Android may suppress fully empty bodies
      const icon =
        toAbsoluteUrl(data?.icon || data?.notification?.icon) ||
        toAbsoluteUrl('assets/icons/icon-192x192.png');
      const badge =
        toAbsoluteUrl(data?.badge || data?.notification?.badge) ||
        toAbsoluteUrl('assets/icons/icon-72x72.png');
      const tag = data?.tag || data?.notification?.tag || 'mtb-push';
      const actions = data?.actions || data?.notification?.actions || [];
      const url =
        data?.url ||
        data?.notification?.data?.url ||
        data?.data?.url ||
        '/MyTradingBox/';

      const options = {
        body,
        icon,
        badge,
        tag,
        actions,
        data: {
          url,
          raw: data || {},
          ts: Date.now(),
        },
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 100, 200],
      };

      await self.registration.showNotification(title, options);
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        console.log('[SW] pushsubscriptionchange');
      } catch {}
      await broadcastToClients({
        type: 'mtb-sw-pushsubscriptionchange',
        ts: Date.now(),
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  try {
    console.log('[SW] notificationclick');
  } catch {}
  event.notification.close();
  const targetUrl =
    (event.notification && event.notification.data && event.notification.data.url) ||
    '/MyTradingBox/';
  event.waitUntil(
    (async () => {
      const clientList = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Prefer focusing an existing client in our scope, but fall back to focusing any.
      const inScope = clientList.find(
        (c) => c.url && self.registration.scope && c.url.startsWith(self.registration.scope),
      );
      const anyClient = clientList[0];
      const toFocus = inScope || anyClient;
      if (toFocus && 'focus' in toFocus) {
        await toFocus.focus();
        try {
          // Ask the app to navigate (single page apps)
          toFocus.postMessage({ type: 'mtb-sw-navigate', url: targetUrl });
        } catch {}
        return;
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })(),
  );
});
