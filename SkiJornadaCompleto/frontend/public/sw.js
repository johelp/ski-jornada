// Service Worker — Ski Jornada
// Proporciona instalación PWA y caché básico de assets estáticos.
// Los recordatorios de navegador se programan desde la app (App.jsx).

const CACHE_NAME = 'ski-jornada-v1';
const STATIC_ASSETS = ['/', '/src/main.jsx', '/src/App.jsx', '/src/App.css'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['/'].catch(() => {}))
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first para la API, cache-first para assets estáticos
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // No cachear peticiones a la API
  if (url.pathname.startsWith('/api/') || url.port === '3000') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push notifications (para recordatorios enviados desde el servidor en el futuro)
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || '⛷️ Ski Jornada', {
      body: data.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: data.tag || 'ski-jornada',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      if (list.length) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});
