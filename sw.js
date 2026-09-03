// Service worker: guarda la app en el dispositivo para que abra sin internet.
// - Archivos locales: red primero (los deploys nuevos llegan solos), con
//   límite de tiempo — con una barra de señal la petición no falla, se
//   cuelga, y sin el límite la app se queda esperando en blanco en vez de
//   caer a la copia guardada.
// - CDN y fuentes: caché primero para no esperar la red, pero revisando
//   siempre en segundo plano — esas URLs son por versión mayor (@2, @4), no
//   por versión exacta, así que sí pueden cambiar de contenido con el tiempo.
// - *.supabase.co nunca se intercepta: su fallo es lo que activa js/offline.js.
const CACHE = 'orden-servicio-v2';

function conTiempoLimite(promesa, ms) {
  return new Promise((resolve, reject) => {
    const vencido = setTimeout(() => reject(new Error('tiempo agotado de red')), ms);
    promesa.then(
      (v) => { clearTimeout(vencido); resolve(v); },
      (err) => { clearTimeout(vencido); reject(err); }
    );
  });
}

const PRECARGA = [
  '.',
  'index.html',
  'css/styles.css',
  'js/app.js', 'js/config.js', 'js/datos.js', 'js/datos-demo.js',
  'js/datos-supabase.js', 'js/offline.js', 'js/offline-logica.js',
  'js/ordenes.js', 'js/firma.js', 'js/pdf.js', 'js/logo.js',
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
    // Red primero: con internet siempre la versión más reciente. Si la
    // petición de todas formas llega tarde (después del límite), su
    // respuesta se sigue guardando para la próxima vez.
    const peticionRed = fetch(e.request).then(guardarCopia);
    e.respondWith(
      conTiempoLimite(peticionRed, 5000)
        .catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
  } else {
    // CDN y fuentes: se sirve la copia guardada al toque si existe (no
    // bloquea la carga), y en paralelo se revisa la red por si el contenido
    // cambió — así la próxima carga ya tiene lo más nuevo, sin depender de
    // subir el nombre de CACHE a mano cada vez que una librería se actualiza.
    e.respondWith(
      caches.match(e.request).then((enCache) => {
        const actualizacion = fetch(e.request).then(guardarCopia).catch(() => enCache);
        return enCache || actualizacion;
      })
    );
  }
});
