// ── AILARA Service Worker v2 ───────────────────────────────────────────────
// Robust offline support — caches app shell + dynamic data

const CACHE_VERSION  = 'ailara-v3';
const STATIC_CACHE   = 'ailara-static-v3';
const DYNAMIC_CACHE  = 'ailara-dynamic-v3';

const NEVER_CACHE = [
  'anthropic.com',
  'stripe.com',
  'api/',
];

// ── Install: cache app shell ───────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
        '/icons/icon-192.png',
        '/icons/icon-512.png',
      ])
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: smart routing ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API/payment/external calls
  if (
    NEVER_CACHE.some(d => url.hostname.includes(d) || url.pathname.includes(d)) ||
    event.request.method !== 'GET'
  ) return;

  // Fonts + CDN — cache first, long-lived
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          const clone = res.clone();
          caches.open(DYNAMIC_CACHE).then(c => c.put(event.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // JS bundle (assets/) — cache first, then update in background (stale-while-revalidate)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          const fetchAndUpdate = fetch(event.request).then(res => {
            cache.put(event.request, res.clone());
            return res;
          });
          return cached || fetchAndUpdate;
        })
      )
    );
    return;
  }

  // App shell (/, /index.html) — network first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone();
        caches.open(STATIC_CACHE).then(c => c.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request).then(cached =>
        cached || caches.match('/index.html')
      ))
  );
});

// ── Push notifications ─────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'AILARA', {
      body: data.body || 'Your coach has a message for you.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || '/'));
});
