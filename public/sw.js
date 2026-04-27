/* Insieme Salute Toscana — service worker.
 *
 * Minimal: handles Web Push events and notification clicks. No offline
 * caching yet (the site is a static SPA-ish thing already served from
 * Cloudflare's edge cache). Add a runtime cache later if needed.
 */

self.addEventListener('install', (event) => {
  // Activate immediately so push works on the first page load.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Insieme Salute Toscana', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Insieme Salute Toscana';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-96.png',
    image: data.image || undefined,
    data: { url: data.url || '/' },
    // Group by topic so a burst of pushes for the same topic collapses.
    tag: data.tag || data.topic || 'site-update',
    renotify: false,
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsList) => {
        // Focus an existing tab on the URL if there is one.
        for (const client of clientsList) {
          try {
            const clientUrl = new URL(client.url);
            const targetUrl = new URL(url, self.location.origin);
            if (clientUrl.pathname === targetUrl.pathname && 'focus' in client) {
              return client.focus();
            }
          } catch (_) {}
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      })
  );
});

// Push subscription change (browser rotates the keys) — re-register.
self.addEventListener('pushsubscriptionchange', (event) => {
  // The new subscription comes via event.newSubscription on some
  // browsers; on others we need to re-subscribe with the same options.
  event.waitUntil(
    (async () => {
      const subs = self.registration.pushManager;
      const oldSub = event.oldSubscription;
      if (!oldSub) return;
      try {
        const newSub =
          event.newSubscription ||
          (await subs.subscribe(oldSub.options));
        // Best-effort tell the server. The endpoint changed, so we send
        // both old (to delete) and new (to store).
        await fetch('/api/push/rotate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ old: oldSub.toJSON(), new: newSub.toJSON() }),
          keepalive: true,
        });
      } catch (e) {
        // Fall through silently — the next page load will re-subscribe.
      }
    })()
  );
});
