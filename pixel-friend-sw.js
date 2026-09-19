/* Pixel-Friend background Web Push service worker. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}

  const title = data.title || '💬 Pixel-Friend';
  const body = data.body || 'You have a new notification.';
  const id = data.notificationId || data.messageId || '';
  const url = data.url || '/';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const focused = windows.some(c => {
      try { return new URL(c.url).origin === self.location.origin && c.focused; } catch (_) { return false; }
    });
    if (focused) return;

    await self.registration.showNotification(title, {
      body,
      icon: data.icon || '/favicon.ico',
      badge: data.badge || '/favicon.ico',
      tag: id ? `pixel-friend-message-${id}` : 'pixel-friend-notification',
      renotify: true,
      requireInteraction: true,
      data: { url, notificationId: id }
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';

  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const sameOrigin = all.find(c => {
      try { return new URL(c.url).origin === self.location.origin; } catch (_) { return false; }
    });
    if (sameOrigin) {
      await sameOrigin.focus();
      try { await sameOrigin.navigate(new URL(url, self.registration.scope).href); } catch (_) {}
      return;
    }
    await clients.openWindow(new URL(url, self.registration.scope).href);
  })());
});
