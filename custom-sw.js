// Custom Service Worker that extends Angular's ngsw-worker
// Ensures push notifications are displayed and clicks focus the app

// Import Angular service worker so caching/offline still works
importScripts('./ngsw-worker.js');

function toAbsoluteUrl(maybeUrl) {
  try {
    if (!maybeUrl) return maybeUrl;
    // Already absolute
    if (/^https?:\/\//i.test(maybeUrl)) return maybeUrl;
    // Absolute to origin
    if (maybeUrl.startsWith('/')) return new URL(maybeUrl, self.location.origin).toString();
    // Relative to SW scope (important for Android/Chrome)
    return new URL(maybeUrl, self.registration.scope).toString();
  } catch {
    return maybeUrl;
  }
}

function firstString(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return '';
}

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

      const title = firstString(
        data && data.title,
        data && data.notification && data.notification.title,
        'New notification',
      );
      // Android may suppress showing a notification if the body is empty in some cases
      const body = firstString(
        data && data.body,
        data && data.notification && data.notification.body,
        ' ',
      );

      const icon = toAbsoluteUrl(
        firstString(
          data && data.icon,
          data && data.notification && data.notification.icon,
          'assets/icons/icon-192x192.png',
        ),
      );
      const badgeRaw = firstString(
        data && data.badge,
        data && data.notification && data.notification.badge,
      );
      const badge = badgeRaw ? toAbsoluteUrl(badgeRaw) : undefined;

      const tag = firstString(data && data.tag, data && data.notification && data.notification.tag);
      const actions = (data && data.actions) || (data && data.notification && data.notification.actions) || [];
      const url = firstString(
        data && data.url,
        data && data.notification && data.notification.data && data.notification.data.url,
      );

      const options = {
        body: body || ' ',
        icon,
        badge,
        tag: tag || undefined,
        actions,
        data: {
          url: url || '/MyTradingBox/',
          ts: Date.now(),
          raw: (() => {
            try {
              return data || {};
            } catch {
              return {};
            }
          })(),
        },
        renotify: true,
        requireInteraction: false,
        vibrate: [100, 50, 100],
        timestamp: Date.now(),
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
      const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      const scope = (() => {
        try {
          return self.registration.scope;
        } catch {
          return '';
        }
      })();

      for (const client of clientList) {
        const inScope = scope && client.url ? client.url.startsWith(scope) : false;
        const isApp = client.url && client.url.includes('/MyTradingBox/');
        if ((inScope || isApp) && 'focus' in client) {
          try {
            client.postMessage({ type: 'mtb-sw-notificationclick', url: targetUrl, ts: Date.now() });
          } catch {}
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })(),
  );
});
