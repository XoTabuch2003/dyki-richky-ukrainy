const CACHE = 'wild-rivers-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/data.js',
  './js/app.js',
  './manifest.json',
  './img/logo.png',
  './img/hero.jpg',
  './img/gobie.jpg',
  './img/qr.png',
  './img/free-icon-fish-2929546.png',
  './img/free-icon-fishing-float-1833972.png',
  './img/free-icon-river-15726726.png',
  './img/free-icon-location-2776063.png',
  './img/free-icon-telegram-11400813.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = e.request.url;
  // Never cache live data or third-party APIs
  if (
    url.includes('jsonbin.io') ||
    url.includes('data.json') ||
    url.includes('basemaps.cartocdn.com') ||
    url.includes('tile.openstreetmap.org') ||
    url.includes('nominatim.openstreetmap.org')
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
