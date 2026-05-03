// Сразу активируем новый SW, не ждём закрытия всех табов
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// При активации: убиваем ВСЕ caches (включая legacy от предыдущих версий SW)
// и берём контроль над всеми открытыми клиентами
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first для navigation requests (index.html) — bypass browser cache.
// Остальные запросы (bundles с хешем в имени) не перехватываем — у них immutable-cache корректный.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'reload' }).catch(() => Response.error())
    );
  }
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
