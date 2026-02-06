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
        data.title || (data.notification && data.notification.title) || 'New notification';
      const body = data.body || (data.notification && data.notification.body) || '';
      const icon =
        (data.icon || (data.notification && data.notification.icon)) ||
        'assets/icons/icon-192x192.png';
      const badge = data.badge || (data.notification && data.notification.badge);
      const tag = data.tag || (data.notification && data.notification.tag);
      const actions =
        data.actions || (data.notification && data.notification.actions) || [];
      const url =
        data.url || (data.notification && data.notification.data && data.notification.data.url);

      const options = {
        body,
        icon,
        badge,
        tag,
        actions,
        data: { url: url || '/MyTradingBox/' },
        renotify: true,
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
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes('/MyTradingBox/') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
