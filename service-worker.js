const CACHE_NAME = 'vng-learnzoo-v1.1.0';
const OFFLINE_URL = '/offline.html';

// Files to cache for offline access – now includes all grade dashboards
const STATIC_CACHE_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/grade6-dashboard.html',
  '/grade7-dashboard.html',
  '/grade8-dashboard.html',
  '/grade9-dashboard.html',
  '/grade10-dashboard.html',
  '/grade11-dashboard.html',
  '/grade12-dashboard.html',
  '/staff-dashboard.html',
  '/shared.css',
  '/game-library.js',
  '/offline.html',
  '/manifest.json',
  '/install-prompt.js'
];

self.addEventListener('install', event => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_CACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  if (url.origin !== location.origin) return;
  
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
          return response;
        })
        .catch(() => caches.match(request).then(resp => resp || caches.match(OFFLINE_URL)))
    );
    return;
  }
  
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => cachedResponse || fetch(request))
  );
});