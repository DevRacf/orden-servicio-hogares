// Service worker: guarda la app en el dispositivo para que abra sin internet.
// - Archivos locales: red primero (los deploys nuevos llegan solos), caché de respaldo.
// - CDN y fuentes: caché primero (URLs versionadas que no cambian).
// - *.supabase.co nunca se intercepta: su fallo es lo que activa js/offline.js.
const CACHE = 'orden-servicio-v1';

const PRECARGA = [
  '.',
  'index.html',
  'css/styles.css',
  'js/app.js', 'js/config.js', 'js/datos.js', 'js/datos-demo.js',
  'js/datos-supabase.js', 'js/offline.js', 'js/offline-logica.js',
  'js/ordenes.js', 'js/firma.js', 'js/pdf.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdn.jsdelivr.net/npm/signature_pad@4/dist/signature_pad.umd.min.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2/dist/jspdf.umd.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECARGA)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(llaves => Promise.all(llaves.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname.endsWith('.supabase.co')) return;

  const guardarCopia = (respuesta) => {
    const copia = respuesta.clone();
    caches.open(CACHE).then(c => c.put(e.request, copia));
    return respuesta;
  };

  if (url.origin === self.location.origin) {
    // Red primero: con internet siempre la versión más reciente.
    e.respondWith(
      fetch(e.request).then(guardarCopia)
        .catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
  } else {
    // CDN y fuentes: caché primero.
    e.respondWith(
      caches.match(e.request).then(enCache => enCache || fetch(e.request).then(guardarCopia))
    );
  }
});
