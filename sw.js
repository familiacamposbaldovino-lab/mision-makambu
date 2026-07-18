const APP_CACHE = 'makambu-shell-2026-07-18-v1';
const RUNTIME_CACHE = 'makambu-runtime-2026-07-18-v1';
const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './offline.html',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  SUPABASE_CDN
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name !== APP_CACHE && name !== RUNTIME_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function isStaticAsset(url) {
  return url.origin === self.location.origin && (
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/style.css') ||
    url.pathname.endsWith('/app.js') ||
    url.pathname.endsWith('/manifest.webmanifest') ||
    url.pathname.endsWith('/offline.html') ||
    url.pathname.includes('/icons/')
  );
}

function isSupabaseRequest(url) {
  return url.hostname.endsWith('supabase.co');
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  if (isSupabaseRequest(url)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await caches.match(request);
        if (cached) return cached;
        return (await caches.match('./index.html')) || caches.match('./offline.html');
      }
    })());
    return;
  }

  if (request.url.startsWith(SUPABASE_CDN) || isStaticAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      const cache = await caches.open(APP_CACHE);
      cache.put(request, response.clone());
      return response;
    })());
  }
});
