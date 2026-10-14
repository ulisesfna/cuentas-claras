// Service worker: red primero y caché como respaldo, para que la app funcione sin conexión.
// Si añades un módulo a js/, añádelo también aquí para que esté disponible sin conexión.
const CACHE = 'cuentas-claras-v3';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './js/main.js',
  ...['util', 'constants', 'format', 'periods', 'calc', 'tags', 'ledger', 'budget', 'recurring', 'model', 'validate',
    'merge', 'crypto', 'rules', 'csv'].map((m) => `./js/core/${m}.js`),
  ...['store', 'dom', 'screen', 'tx-editor', 'tags', 'categories', 'accounts', 'period', 'recurring', 'budget', 'backup',
    'security', 'analysis', 'importer', 'menu', 'help'].map((m) => `./js/ui/${m}.js`),
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
  );
});
