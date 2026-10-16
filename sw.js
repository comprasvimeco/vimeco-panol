/* VIMECO S.A. — Pañol: service worker para que la app abra sin señal.

   Siempre prueba la red primero (así un cambio publicado se ve enseguida) y, si no hay
   o tarda más de 3 s, usa la copia guardada. Sólo toca los archivos de la app: Firebase
   y los CDN van directo. Al agregar un archivo a la app, sumarlo a ARCHIVOS. */

const CACHE = 'panol-v1';
const ARCHIVOS = [
  './', 'index.html', 'panol.html', 'manifest.json', 'icono_app.png', 'assets/logo_claro.png',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'css/styles.css',
  'js/auth.js', 'js/config.js', 'js/datos.js', 'js/gemini.js', 'js/icons.js', 'js/install.js', 'js/jspdf.umd.min.js',
  'js/logoBase64.js', 'js/offline.js', 'js/panol.js', 'js/panolExport.js', 'js/ui.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // no-cache: que el navegador no use su copia de hasta 10 min de Pages; si no cambió, el servidor
  // contesta 304 y es casi nada. Si no, puede mezclar el HTML nuevo con el JS viejo.
  const red = fetch(req, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
    return r;
  });
  e.waitUntil(red.then(() => {}, () => {}));
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(guardada => {
    if (!guardada) return red;
    return Promise.race([red.catch(() => guardada), new Promise(ok => setTimeout(() => ok(guardada), 3000))]);
  }));
});
