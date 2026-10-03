/* MINAW DVO service worker: lets phones install the app, and shows the last good app page when offline.
   Everything else (code files, Supabase data, music, images) goes straight to the network as normal. */
const CACHE = 'minaw-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))  // drops old caches (incl. v1's saved files)
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  // Network first, so a new deploy shows up right away. Only a good (200) page is saved for offline use.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); }
        return res;
      })
      .catch(() => caches.match('/').then((r) => r || Response.error())),
  );
});
