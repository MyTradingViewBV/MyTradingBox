// Custom Service Worker that extends Angular's ngsw-worker
// Ensures push notifications are displayed and clicks focus the app

// Import Angular service worker so caching/offline still works
importScripts('./ngsw-worker.js');

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    // Fallback for non-JSON payloads
    data = { title: 'Notification', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || (data.notification && data.notification.title) || 'New notification';
  const body = data.body || (data.notification && data.notification.body) || '';
  const icon = (data.icon || (data.notification && data.notification.icon)) || 'assets/icons/icon-192x192.png';
  const badge = data.badge || (data.notification && data.notification.badge);
  const tag = data.tag || (data.notification && data.notification.tag);
  const actions = data.actions || (data.notification && data.notification.actions) || [];
  const url = data.url || (data.notification && data.notification.data && data.notification.data.url);

  const options = {
    body,
    icon,
    badge,
    tag,
    actions,
    data: { url },
    // Ensures notification is shown if app is in background
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification && event.notification.data && event.notification.data.url) || '/MyTradingBox/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
