const CACHE_NAME = 'iwe-iranti-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './idb.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first, falling back to network, so the diary works fully offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});

// Allow the page to trigger a local notification (reminder) via the service worker.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_REMINDER') {
    self.registration.showNotification(event.data.title || 'Ìwé Ìrántí', {
      body: event.data.body || 'Time to write in your diary.',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'diary-reminder'
    });
  }
});
