// Offline support: serve the app from cache, refresh it in the background.
// Bump VERSION when shipping changes so phones pick up the new files.
const VERSION = 'v2';
const CACHE = 'scorekeeper-' + VERSION;
const SHELL = [
  './',
  'index.html',
  'app.css',
  'app.js',
  'game.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('scorekeeper-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only handle our own app files; the word list is cached by the app itself.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/words.txt')) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await network) || (await cache.match('index.html'));
    }),
  );
});
