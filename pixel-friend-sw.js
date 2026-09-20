/* Pixel-Friend background Web Push worker.  Requires HTTPS/localhost. */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    data = { body: event.data ? event.data.text() : 'New Pixel-Friend notification' };
  }
  const title = String(data.title || 'Pixel-Friend');
  const options = {
    body: String(data.body || 'New notification'),
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: String(data.tag || ('pixel-friend-' + Date.now())),
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: data.data || {}
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('pushsubscriptionchange', event => {
  // The app will reconcile a new subscription when the user next opens it.
  // Keep the worker alive for the browser's push lifecycle.
  event.waitUntil(Promise.resolve());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of clients) {
      if ('focus' in client) {
        try { await client.navigate(url); } catch (_) {}
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
