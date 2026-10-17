// Service worker: red primero y caché como respaldo, para que la app funcione sin conexión.
// Si añades un módulo a js/, añádelo también aquí para que esté disponible sin conexión.
//
// En GitHub Pages todas tus apps comparten dominio (usuario.github.io) y, con él, el almacén de
// cachés. Por eso este service worker solo crea, consulta y borra cachés que empiezan por PREFIX
// y solo atiende peticiones de su propia carpeta: actualizar esta app no toca las demás.
const PREFIX = 'cuentas-claras-';
const CACHE = PREFIX + 'v5';
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
      // Solo las versiones antiguas de ESTA app; las cachés de las demás apps no se tocan.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Nada fuera de la carpeta de esta app (otras apps del mismo dominio, otros sitios).
  if (req.method !== 'GET' || !req.url.startsWith(self.registration.scope)) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      // Sin conexión: se busca solo en la caché de esta app.
      .catch(() => caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true })
        .then((r) => r || (req.mode === 'navigate' ? c.match('./index.html') : null))
        .then((r) => r || Response.error()))),
  );
});
