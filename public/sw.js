self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Сад ведущих', body: event.data.text() };
  }

  const title = payload.title || 'Сад ведущих';
  const body = payload.body || 'У вас новое уведомление';
  const icon = payload.icon || '/favicon.png';
  const badge = payload.badge || '/favicon.png';
  const url = payload.url || '/';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      data: { url },
      tag: payload.tag || 'garden-news',
      renotify: Boolean(payload.renotify)
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(targetUrl);
        return;
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
