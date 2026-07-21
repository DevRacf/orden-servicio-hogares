# Marca de agua + buscador + modo sin internet — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Logo como marca de agua en el PDF, buscador por cliente/folio en la lista, y
modo sin internet: completar órdenes sin señal con sincronización automática al
reconectar.

**Architecture:** La marca de agua embebe el logo como data-URL (`js/logo.js`) y lo
dibuja tenue en cada página del PDF. El buscador es una función pura (`filtrarOrdenes`)
más un input que repinta la lista. El modo offline agrega una capa envolvente sobre la
capa Supabase (`js/offline.js`, con su lógica pura testeable en `js/offline-logica.js`),
un service worker (`sw.js`) que guarda la app en el dispositivo, y avisos de estado en
la UI. El modo demo no cambia.

**Tech Stack:** El mismo del proyecto — JavaScript vanilla (módulos ES), `node --test`,
jsPDF (GState para opacidad), Service Worker API, localStorage.

**Spec:** `docs/superpowers/specs/2026-07-15-marca-agua-buscador-offline-design.md`

**Rama:** Crear `desarrollo` desde `main` antes de la primera tarea
(`git checkout -b desarrollo`). No trabajar directo en `main`.

**Convenciones:** Igual que el resto del proyecto — español en código/UI, commits en
español con trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`, TDD para
lógica pura.

---

## Estructura de archivos

| Archivo | Cambio |
|---|---|
| `js/ordenes.js` | Nueva función pura `filtrarOrdenes` (+ helper `normalizar` interno) |
| `tests/ordenes.test.js` | Prueba de `filtrarOrdenes` |
| `index.html` | Input de búsqueda; letrero de sin conexión |
| `js/app.js` | Buscador; registro del SW; aviso de conexión; chip "por enviar"; disparadores de sincronización |
| `css/styles.css` | Estilos del buscador, letrero y chip |
| `js/offline-logica.js` | Lógica pura de la cola (testeable en Node) |
| `tests/offline.test.js` | Pruebas de la lógica pura de la cola |
| `js/offline.js` | Capa envolvente de Supabase: caché de órdenes + cola + sincronización |
| `js/datos.js` | En modo supabase usa `offline` en vez de `datos-supabase` directo |
| `sw.js` | Service worker (raíz del repo) |
| `recursos/logo-hi.png` | Logo fuente (lo entrega Andre; el controlador lo copia aquí) |
| `scripts/generar-logo.js` | Convierte el PNG a `js/logo.js` |
| `js/logo.js` | Generado: data-URL + dimensiones del logo |
| `js/pdf.js` | Marca de agua en cada página |
| `tests/pdf.test.js` | Prueba de sanidad del logo embebido |

Las tareas 1-5 no dependen del logo. La tarea 6 (marca de agua) requiere que
`recursos/logo-hi.png` exista — si no está, se reporta BLOCKED y se continúa con la 7
solo si la 6 quedó resuelta.

---

### Task 1: Función pura `filtrarOrdenes` (TDD)

**Files:**
- Modify: `js/ordenes.js`
- Test: `tests/ordenes.test.js`

- [ ] **Step 0: Crear la rama de trabajo (solo si no existe ya)**

```bash
git checkout -b desarrollo
```

- [ ] **Step 1: Agregar la prueba al final de `tests/ordenes.test.js`** (y sumar
  `filtrarOrdenes` al import existente de `../js/ordenes.js`):

```js
test('filtrarOrdenes busca por cliente o folio, sin acentos ni mayúsculas', () => {
  const ordenes = [
    { id: 'a', folio: 'OS-0001', cliente_nombre: 'Familia Gómez Herrera' },
    { id: 'b', folio: 'OS-0002', cliente_nombre: 'Ferretería El Martillo' },
    { id: 'c', folio: 'OS-0003', cliente_nombre: 'Consultorio Dental Sonrisa' }
  ];
  assert.deepEqual(filtrarOrdenes(ordenes, 'gomez').map(o => o.id), ['a']);
  assert.deepEqual(filtrarOrdenes(ordenes, 'FERRETERIA').map(o => o.id), ['b']);
  assert.deepEqual(filtrarOrdenes(ordenes, 'os-0003').map(o => o.id), ['c']);
  assert.deepEqual(filtrarOrdenes(ordenes, '  '), ordenes);
  assert.deepEqual(filtrarOrdenes(ordenes, ''), ordenes);
  assert.deepEqual(filtrarOrdenes(ordenes, 'zzz'), []);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test`
Expected: FAIL — `filtrarOrdenes` no está exportada en `js/ordenes.js`. Las 13 pruebas
existentes siguen en verde.

- [ ] **Step 3: Agregar a `js/ordenes.js`** (después de `etiquetasServicios`):

```js
function normalizar(texto) {
  return (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function filtrarOrdenes(ordenes, texto) {
  const t = normalizar(texto).trim();
  if (!t) return ordenes;
  return (ordenes || []).filter(o =>
    normalizar(o.cliente_nombre).includes(t) || normalizar(o.folio).includes(t));
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test`
Expected: PASS — 14 pruebas en verde (10 de `ordenes.test.js` + 4 de `pdf.test.js`).

- [ ] **Step 5: Commit**

```bash
git add js/ordenes.js tests/ordenes.test.js
git commit -m "Función pura de búsqueda por cliente o folio"
```

---

### Task 2: Buscador en la lista

**Files:**
- Modify: `index.html` (input de búsqueda)
- Modify: `js/app.js` (pintado extraído + listener)
- Modify: `css/styles.css` (margen del buscador)

- [ ] **Step 1: En `index.html`, agregar el input** justo después de
  `<a href="#/nueva" class="boton">+ Nueva orden</a>`:

```html
      <input type="search" id="buscador" aria-label="Buscar por cliente o folio" placeholder="Buscar por cliente o folio" autocomplete="off">
```

- [ ] **Step 2: En `js/app.js`, sumar `filtrarOrdenes` al import de `./ordenes.js`**

El import queda:

```js
import {
  TIPOS_CLIENTE,
  validarNuevaOrden, validarCierre, limpiarMateriales,
  ordenarParaLista, formatearFecha, etiquetasServicios, filtrarOrdenes
} from './ordenes.js';
```

- [ ] **Step 3: En `js/app.js`, agregar estado y extraer el pintado de listas.**
  Agregar junto a los otros `let` del módulo:

```js
let ordenesCargadas = [];
```

  Y reemplazar la función `renderLista` completa por:

```js
function pintarListas(ordenes) {
  const { pendientes, completadas } = ordenarParaLista(ordenes);
  $('#lista-pendientes').innerHTML =
    pendientes.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes pendientes</p>';
  $('#lista-completadas').innerHTML =
    completadas.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes completadas</p>';
}

async function renderLista() {
  // Si la lista ya estaba visible (recarga en el sitio: reconexión, sincronización
  // de la cola offline), no es una navegación nueva — se conserva lo que el usuario
  // ya escribió en el buscador en vez de borrarlo bajo sus dedos.
  const yaVisible = !document.getElementById('vista-lista').classList.contains('oculto');
  mostrarVista('vista-lista');
  if (!yaVisible) $('#buscador').value = '';
  const hashEsperado = location.hash || '#/';
  const ordenes = await datos.listarOrdenes();
  // Si el usuario ya navegó a otra vista mientras esto cargaba, no pisar su pantalla actual.
  if ((location.hash || '#/') !== hashEsperado) return;
  ordenesCargadas = ordenes;
  pintarListas(filtrarOrdenes(ordenesCargadas, $('#buscador').value));
}
```

- [ ] **Step 4: Agregar el listener del buscador** (junto a los otros listeners):

```js
$('#buscador').addEventListener('input', () => {
  pintarListas(filtrarOrdenes(ordenesCargadas, $('#buscador').value));
});
```

- [ ] **Step 5: Agregar a `css/styles.css`** (al final):

```css
#buscador { margin-top: 0.8rem; }
```

- [ ] **Step 6: Verificar en navegador**

Servidor con `python3 -m http.server 8123` (no usar `preview_start` con nombre — a veces
toma la config de otro proyecto; usar la URL directa). Entrar y en la lista:
- Escribir parte de un nombre de cliente: solo aparecen las tarjetas que coinciden, en
  ambas secciones.
- Escribir un folio (`os-0002` en minúsculas): aparece esa orden.
- Borrar el texto: vuelven todas.
- Navegar a una orden y volver: el buscador está limpio y la lista completa.
- Consola sin errores.

- [ ] **Step 7: Commit**

```bash
git add index.html js/app.js css/styles.css
git commit -m "Buscador por cliente o folio en la lista de órdenes"
```

---

### Task 3: Lógica pura de la cola offline (TDD)

**Files:**
- Create: `js/offline-logica.js`
- Test: `tests/offline.test.js`

- [ ] **Step 1: Crear `tests/offline.test.js`**:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agregarACola, aplicarCierresPendientes, quitarDeCola } from '../js/offline-logica.js';

test('agregarACola agrega y reemplaza el cierre de la misma orden', () => {
  const c1 = agregarACola([], 'a', { trabajo_realizado: 'x' }, 1000);
  assert.equal(c1.length, 1);
  const c2 = agregarACola(c1, 'b', { trabajo_realizado: 'y' }, 2000);
  assert.equal(c2.length, 2);
  const c3 = agregarACola(c2, 'a', { trabajo_realizado: 'z' }, 3000);
  assert.equal(c3.length, 2);
  assert.equal(c3.find(c => c.ordenId === 'a').cierre.trabajo_realizado, 'z');
});

test('aplicarCierresPendientes marca completada + porEnviar solo a las encoladas', () => {
  const ordenes = [
    { id: 'a', estado: 'pendiente', trabajo_realizado: null },
    { id: 'b', estado: 'pendiente' }
  ];
  const cola = [{
    ordenId: 'a',
    cierre: { trabajo_realizado: 'Listo', materiales: [{ cantidad: 1, descripcion: 'Cable' }] },
    timestamp: 1700000000000
  }];
  const resultado = aplicarCierresPendientes(ordenes, cola);
  assert.equal(resultado[0].estado, 'completada');
  assert.equal(resultado[0].porEnviar, true);
  assert.equal(resultado[0].trabajo_realizado, 'Listo');
  assert.match(resultado[0].completed_at, /^\d{4}-/);
  assert.equal(resultado[1].estado, 'pendiente');
  assert.equal(resultado[1].porEnviar, undefined);
});

test('aplicarCierresPendientes con cola vacía regresa las órdenes tal cual', () => {
  const ordenes = [{ id: 'a', estado: 'pendiente' }];
  assert.equal(aplicarCierresPendientes(ordenes, []), ordenes);
});

test('quitarDeCola remueve solo la orden indicada', () => {
  const cola = [{ ordenId: 'a' }, { ordenId: 'b' }];
  assert.deepEqual(quitarDeCola(cola, 'a').map(c => c.ordenId), ['b']);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/offline-logica.js'`. Las 14 previas en verde.

- [ ] **Step 3: Crear `js/offline-logica.js`**:

```js
// Lógica pura del modo sin internet: opera sobre datos planos, sin tocar
// localStorage ni red, para poder probarse en Node.

// Copia de la cola con el cierre agregado; si ya había un cierre encolado
// para la misma orden, lo reemplaza (el más reciente gana).
export function agregarACola(cola, ordenId, cierre, timestamp) {
  return [...(cola || []).filter(c => c.ordenId !== ordenId), { ordenId, cierre, timestamp }];
}

// Marca en la copia local las órdenes cuyo cierre está encolado: quedan
// completadas con bandera porEnviar para que la UI las muestre correctamente.
export function aplicarCierresPendientes(ordenes, cola) {
  if (!cola || cola.length === 0) return ordenes;
  const porId = new Map(cola.map(c => [c.ordenId, c]));
  return (ordenes || []).map(o => {
    const c = porId.get(o.id);
    if (!c) return o;
    return {
      ...o,
      ...c.cierre,
      estado: 'completada',
      completed_at: new Date(c.timestamp).toISOString(),
      porEnviar: true
    };
  });
}

export function quitarDeCola(cola, ordenId) {
  return (cola || []).filter(c => c.ordenId !== ordenId);
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test`
Expected: PASS — 18 pruebas en verde (10 + 4 + 4).

- [ ] **Step 5: Commit**

```bash
git add js/offline-logica.js tests/offline.test.js
git commit -m "Lógica pura de la cola de cierres offline"
```

---

### Task 4: Capa offline y cableado en datos.js

**Files:**
- Create: `js/offline.js`
- Modify: `js/datos.js`
- Modify: `js/datos-supabase.js` (para que `completarOrden` respete una fecha de
  cierre ya dada, en vez de siempre usar el momento de la llamada — necesario
  para que la sincronización no reemplace la hora real en que el técnico
  completó la orden por la hora en que se recuperó la señal)

Sin pruebas unitarias aquí (localStorage/red no existen en Node); la lógica con
decisiones ya quedó probada en la Tarea 3 y el resto se verifica en navegador en la
Tarea 7.

- [ ] **Step 1: Crear `js/offline.js`**:

```js
// Capa que envuelve a datos-supabase para funcionar sin internet:
// - cachea las órdenes en localStorage al leerlas con red
// - encola los cierres hechos sin red y los reenvía al reconectar
// El modo demo no pasa por aquí (ya es local por naturaleza).
import * as sb from './datos-supabase.js';
import { agregarACola, aplicarCierresPendientes, quitarDeCola } from './offline-logica.js';

const LLAVE_CACHE = 'cache_ordenes';
const LLAVE_COLA = 'cola_cierres';

function leerCache() { return JSON.parse(localStorage.getItem(LLAVE_CACHE) || 'null'); }
function guardarCache(ordenes) { localStorage.setItem(LLAVE_CACHE, JSON.stringify(ordenes)); }
function leerCola() { return JSON.parse(localStorage.getItem(LLAVE_COLA) || '[]'); }
function guardarCola(cola) { localStorage.setItem(LLAVE_COLA, JSON.stringify(cola)); }

// Distingue "no hay conexión" de un error del servidor: solo los fallos de
// red van a la caché/cola; los demás suben al llamador como siempre.
function esFalloDeRed(err) {
  return !navigator.onLine ||
    err instanceof TypeError ||
    /fetch|network/i.test(String(err?.message || ''));
}

let sincronizando = false;

// Reenvía los cierres encolados, en orden. Un fallo detiene el intento (se
// reintenta en la siguiente oportunidad); la cola nunca se descarta.
export async function sincronizar() {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;
  try {
    let cola = leerCola();
    for (const item of [...cola]) {
      try {
        // Se manda la fecha real de cierre (cuando el técnico terminó, no
        // cuando volvió la señal) para que datos-supabase.js la respete.
        await sb.completarOrden(item.ordenId, {
          ...item.cierre,
          completed_at: new Date(item.timestamp).toISOString()
        });
        cola = quitarDeCola(cola, item.ordenId);
        guardarCola(cola);
      } catch (err) {
        console.error('No se pudo sincronizar el cierre de', item.ordenId, err);
        break;
      }
    }
  } finally {
    sincronizando = false;
  }
}

export async function listarOrdenes() {
  try {
    await sincronizar();
    const ordenes = await sb.listarOrdenes();
    guardarCache(ordenes);
    return aplicarCierresPendientes(ordenes, leerCola());
  } catch (err) {
    if (!esFalloDeRed(err)) throw err;
    const cache = leerCache();
    if (!cache) throw err;
    return aplicarCierresPendientes(cache, leerCola());
  }
}

export async function obtenerOrden(id) {
  try {
    const orden = await sb.obtenerOrden(id);
    if (orden) {
      const cache = leerCache();
      if (cache) {
        guardarCache(cache.some(o => o.id === orden.id)
          ? cache.map(o => (o.id === orden.id ? orden : o))
          : [...cache, orden]);
      }
    }
    return aplicarCierresPendientes(orden ? [orden] : [], leerCola())[0] || null;
  } catch (err) {
    if (!esFalloDeRed(err)) throw err;
    const cache = leerCache() || [];
    return aplicarCierresPendientes(cache, leerCola()).find(o => o.id === id) || null;
  }
}

export async function completarOrden(id, cierre) {
  try {
    const orden = await sb.completarOrden(id, cierre);
    const cache = leerCache();
    if (cache) guardarCache(cache.map(o => (o.id === id ? orden : o)));
    return orden;
  } catch (err) {
    if (!esFalloDeRed(err)) throw err;
    const cola = agregarACola(leerCola(), id, cierre, Date.now());
    guardarCola(cola);
    const cache = leerCache() || [];
    return aplicarCierresPendientes(cache, cola).find(o => o.id === id)
      || aplicarCierresPendientes([{ id, estado: 'pendiente' }], cola)[0];
  }
}

export const { iniciarSesion, haySesion, cerrarSesion, listarTecnicos, crearOrden } = sb;
```

- [ ] **Step 2: Reemplazar `js/datos.js` completo**:

```js
import { CONFIG } from './config.js';
import * as demo from './datos-demo.js';
import * as offline from './offline.js';

const impl = CONFIG.MODO === 'supabase' ? offline : demo;

export const {
  iniciarSesion, haySesion, cerrarSesion,
  listarTecnicos, listarOrdenes, obtenerOrden,
  crearOrden, completarOrden
} = impl;

// Solo existe en modo supabase (reenvía cierres encolados); en demo queda undefined.
export const sincronizar = impl.sincronizar;
```

- [ ] **Step 3: Modificar `js/datos-supabase.js`** para que `completarOrden` respete
  una `completed_at` ya incluida en `cierre` (la sincronización offline la manda; el
  flujo normal en línea no la manda, así que se sigue usando "ahora" como antes).
  Cambiar (dentro de `completarOrden`):

```js
    .update({ ...cierre, estado: 'completada', completed_at: new Date().toISOString() })
```

  por:

```js
    .update({ ...cierre, estado: 'completada', completed_at: cierre.completed_at || new Date().toISOString() })
```

- [ ] **Step 4: Sanidad de sintaxis y pruebas**

Run: `node --check js/offline.js && node --check js/datos.js && node --check js/datos-supabase.js && npm test`
Expected: sin errores de sintaxis; 18 pruebas en verde (nada de esto corre en Node).

- [ ] **Step 5: Verificación rápida en navegador (camino con red)**

Con el servidor local y la app en modo producción (Supabase real): entrar, ver la lista,
abrir una orden, completar una orden normal (con red) y confirmar que su fecha de
cierre sigue siendo "ahora" como siempre — todo debe funcionar igual que antes (la
capa envuelve sin cambiar el comportamiento con red). Consola sin errores.

- [ ] **Step 6: Commit**

```bash
git add js/offline.js js/datos.js js/datos-supabase.js
git commit -m "Capa offline: caché de órdenes, cola de cierres y fecha real de cierre al sincronizar"
```

---

### Task 5: Service worker, aviso de conexión y chip "por enviar"

**Files:**
- Create: `sw.js` (raíz del repo)
- Modify: `index.html` (letrero)
- Modify: `js/app.js` (registro SW, aviso, chip, sincronización al reconectar)
- Modify: `css/styles.css` (letrero y chip)

- [ ] **Step 1: Crear `sw.js`** en la raíz del repo:

```js
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
```

(Nota: `js/logo.js` no va en la precarga porque lo crea la Tarea 6 — la caché en tiempo
de ejecución lo guarda sola en la primera visita, igual que las fuentes de Google.)

- [ ] **Step 2: En `index.html`, agregar el letrero** justo después de `</header>`:

```html
  <div id="aviso-offline" class="aviso-offline oculto">Sin conexión — los cierres se guardarán y enviarán solos</div>
```

- [ ] **Step 3: En `js/app.js`, agregar el chip "por enviar".**

En `tarjetaOrden`, reemplazar la línea:

```js
    <strong>${escapar(o.folio)}</strong> · ${escapar(o.cliente_nombre)}
```

por:

```js
    <strong>${escapar(o.folio)}</strong> · ${escapar(o.cliente_nombre)}${o.porEnviar ? ' <span class="estado por-enviar">por enviar</span>' : ''}
```

En `renderOrden`, reemplazar la línea del encabezado:

```js
    <h2>${escapar(o.folio)} <span class="estado ${o.estado}">${o.estado}</span></h2>
```

por:

```js
    <h2>${escapar(o.folio)} <span class="estado ${o.estado}">${o.estado}</span>${o.porEnviar ? ' <span class="estado por-enviar">por enviar</span>' : ''}</h2>
```

- [ ] **Step 4: En `js/app.js`, agregar al final del archivo** (después de la línea
  `rutear();`):

```js
function actualizarAvisoConexion() {
  $('#aviso-offline').classList.toggle('oculto', navigator.onLine);
}

window.addEventListener('online', async () => {
  actualizarAvisoConexion();
  await datos.sincronizar?.();
  rutear();
});
window.addEventListener('offline', actualizarAvisoConexion);
actualizarAvisoConexion();

// Al arrancar la app también se reenvía lo encolado (p. ej. si la señal volvió
// con la app cerrada); en modo demo `sincronizar` es undefined y no hace nada.
datos.sincronizar?.();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
}
```

- [ ] **Step 5: Agregar a `css/styles.css`** (al final):

```css
.aviso-offline {
  background: var(--pendiente-fondo);
  color: var(--pendiente-texto);
  text-align: center;
  font-weight: 600;
  font-size: 0.88rem;
  padding: 0.5rem 1rem;
}

.estado.por-enviar { background: var(--azul); color: var(--blanco); }
```

- [ ] **Step 6: Verificar en navegador (registro y precarga)**

Con el servidor local, recargar la app y vía `javascript_tool`:

```js
(async () => ({
  registros: (await navigator.serviceWorker.getRegistrations()).length,
  caches: await caches.keys(),
  archivos: (await (await caches.open('orden-servicio-v1')).keys()).length
}))();
```

Expected: 1 registro, caché `orden-servicio-v1` presente, ~16 archivos precargados.
Recargar de nuevo con red: la página viene fresca del servidor (red primero). Consola
sin errores.

- [ ] **Step 7: Commit**

```bash
git add sw.js index.html js/app.js css/styles.css
git commit -m "Service worker, aviso de sin conexión y chip por enviar"
```

---

### Task 6: Logo embebido y marca de agua en el PDF

**Files:**
- Requiere: `recursos/logo-hi.png` (lo coloca el controlador con el archivo de Andre)
- Create: `scripts/generar-logo.js`
- Create: `js/logo.js` (generado)
- Modify: `js/pdf.js`
- Test: `tests/pdf.test.js`

- [ ] **Step 0: Verificar que el logo existe**

Run: `ls -la recursos/logo-hi.png`
Si NO existe: reportar **BLOCKED** y no continuar esta tarea (las demás no dependen de
ella). El controlador debe copiar el PNG de Andre a esa ruta.

- [ ] **Step 1: Crear `scripts/generar-logo.js`**:

```js
// Convierte recursos/logo-hi.png en js/logo.js (data-URL + dimensiones).
// Correr desde la raíz del proyecto: node scripts/generar-logo.js
import { readFileSync, writeFileSync } from 'node:fs';

const png = readFileSync('recursos/logo-hi.png');
if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('recursos/logo-hi.png no es un PNG');
const ancho = png.readUInt32BE(16);
const alto = png.readUInt32BE(20);

writeFileSync('js/logo.js', `// Generado por scripts/generar-logo.js — no editar a mano.
export const LOGO_DATAURL = 'data:image/png;base64,${png.toString('base64')}';
export const LOGO_ANCHO = ${ancho};
export const LOGO_ALTO = ${alto};
`);
console.log(`js/logo.js generado (${ancho}x${alto}, ${Math.round(png.length / 1024)} KB)`);
```

- [ ] **Step 2: Si el PNG pesa más de ~150 KB, reducirlo antes de generar** (el PDF
  final debe quedar en decenas de KB):

```bash
ls -la recursos/logo-hi.png
# Solo si pesa >150KB:
sips -Z 800 recursos/logo-hi.png
```

- [ ] **Step 3: Generar `js/logo.js`**

Run: `node scripts/generar-logo.js`
Expected: `js/logo.js generado (<ancho>x<alto>, <peso> KB)`

- [ ] **Step 4: Agregar la prueba de sanidad al final de `tests/pdf.test.js`**:

```js
test('el logo embebido es un PNG válido con dimensiones', async () => {
  const { LOGO_DATAURL, LOGO_ANCHO, LOGO_ALTO } = await import('../js/logo.js');
  assert.ok(LOGO_DATAURL.startsWith('data:image/png;base64,'));
  assert.ok(LOGO_ANCHO > 0 && LOGO_ALTO > 0);
});
```

Run: `npm test`
Expected: PASS — 19 pruebas en verde (10 + 5 + 4).

- [ ] **Step 5: Marca de agua en `js/pdf.js`.**

Agregar el import al inicio (después del import de `./ordenes.js`):

```js
import { LOGO_DATAURL, LOGO_ANCHO, LOGO_ALTO } from './logo.js';
```

Agregar la función (después de `bloqueTexto` y antes de `generarPdf`):

```js
// Marca de agua: logo centrado y tenue detrás del contenido de cada página.
function marcaDeAgua(doc) {
  const ANCHO_MARCA = 120;
  const altoMarca = ANCHO_MARCA * (LOGO_ALTO / LOGO_ANCHO);
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.1 }));
  doc.addImage(LOGO_DATAURL, 'PNG', (216 - ANCHO_MARCA) / 2, (279 - altoMarca) / 2, ANCHO_MARCA, altoMarca);
  doc.restoreGraphicsState();
}
```

Dentro de `generarPdf`, reemplazar:

```js
  function saltarPaginaSiNecesario() {
    if (y > ABAJO) { doc.addPage(); y = 30; }
  }
```

por:

```js
  function saltarPaginaSiNecesario() {
    if (y > ABAJO) { doc.addPage(); marcaDeAgua(doc); y = 30; }
  }

  marcaDeAgua(doc);
```

y reemplazar la línea del bloque de firmas:

```js
  if (y > 225) { doc.addPage(); y = 30; } else { y = Math.max(y + 10, 225); }
```

por:

```js
  if (y > 225) { doc.addPage(); marcaDeAgua(doc); y = 30; } else { y = Math.max(y + 10, 225); }
```

- [ ] **Step 6: Verificar en navegador**

Abrir una orden completada, generar el PDF vía `javascript_tool` con `generarPdf()` y
revisar:
- El blob empieza con `%PDF-` y pesa decenas de KB (no MB). Si pesa más de ~300 KB,
  volver al Step 2 y reducir el PNG.
- Descargar/abrir el PDF: el logo se ve centrado y tenue en cada página, con el texto y
  las firmas perfectamente legibles encima. Si se percibe muy fuerte o muy débil, se
  permite ajustar la opacidad dentro de 0.06–0.15 (spec).
- Consola sin errores.

- [ ] **Step 7: Commit**

```bash
git add recursos/logo-hi.png scripts/generar-logo.js js/logo.js js/pdf.js tests/pdf.test.js
git commit -m "Logo embebido y marca de agua en el PDF"
```

---

### Task 7: Verificación end-to-end del modo offline y regresión

**Files:**
- Modify: solo lo que la verificación exija corregir

- [ ] **Step 1: Pruebas unitarias completas**

Run: `npm test`
Expected: PASS — 19 en verde (o 18 si la Tarea 6 quedó BLOCKED por falta de logo).

- [ ] **Step 2: Simulacro offline completo en navegador**

Con el servidor local y Supabase real. Se necesita una sesión iniciada: usar la que ya
persiste en el navegador de pruebas (quedó de verificaciones anteriores). Si no hay
sesión activa, NO pedir la clave a nadie — reportar el bloqueo al controlador y que él
resuelva con Andre:

1. Cargar la lista con red (esto llena `cache_ordenes`).
2. Cortar la "red" de datos vía `javascript_tool`:

```js
window.fetchOriginal = window.fetch;
window.fetch = (...args) => {
  const url = String(args[0]?.url || args[0]);
  if (url.includes('supabase.co')) return Promise.reject(new TypeError('Failed to fetch'));
  return window.fetchOriginal(...args);
};
```

3. Navegar a la lista de nuevo (recargar por hash, no F5): las órdenes salen de la
   copia local.
4. Abrir una orden pendiente, llenar trabajo + un material + ambas firmas (PointerEvents
   sintéticos como en verificaciones anteriores), guardar.
5. Confirmar: la orden queda "completada" con chip "por enviar" en detalle y lista;
   `localStorage.cola_cierres` tiene 1 elemento; el PDF se genera sin red.
6. Restaurar la red: `window.fetch = window.fetchOriginal` y simular el regreso:
   `window.dispatchEvent(new Event('online'))`.
7. Confirmar: la cola queda vacía, el chip "por enviar" desaparece, y en Supabase la
   orden está completada (verificar vía la propia app recargando la lista).
8. Consola: solo el `console.error` esperado de los intentos sin red, nada más.

- [ ] **Step 3: Letrero de sin conexión**

`window.dispatchEvent(new Event('offline'))` → aparece el letrero;
`new Event('online')` → desaparece. (El evento sintético no cambia `navigator.onLine`,
así que verificar el letrero con los eventos y aceptar que `navigator.onLine` real siga
true.)

- [ ] **Step 4: Prueba real del service worker**

1. Con la app cargada y el SW activo, **detener** el servidor local
   (`pkill -f "http.server 8123"`).
2. Recargar la página completa (F5/navigate): la app debe abrir desde la caché del SW.
3. Reiniciar el servidor para las siguientes pruebas.

- [ ] **Step 5: Regresión general (escritorio y 375px)**

Flujo normal con red: lista, buscador, crear orden con servicios, completar con firmas,
PDF con marca de agua, sin desbordes horizontales en 375px, consola limpia.

- [ ] **Step 6: Commit de correcciones (solo si hubo)**

```bash
git add -A
git commit -m "Correcciones tras verificación end-to-end del modo offline"
```

---

## Notas para quien ejecute

- **Rama**: todo sobre `desarrollo` (creada en la Tarea 1 Step 0). El merge a `main` y
  el push a GitHub Pages los decide Andre al final (skill de cierre de rama).
- **El logo** (`recursos/logo-hi.png`) lo entrega Andre; si no está al llegar a la
  Tarea 6, esa tarea se reporta BLOCKED y las demás continúan.
- **Los eventos `online`/`offline` sintéticos** no cambian `navigator.onLine`; por eso
  `esFalloDeRed` también acepta el `TypeError` del fetch — el monkey-patch de la Tarea 7
  simula el fallo real de red por esa vía.
- **El SW en localhost**: `http://localhost` es contexto seguro, el SW funciona igual
  que en GitHub Pages. La ruta relativa `sw.js` respeta el scope
  `/orden-servicio-hogares/` en producción.
- **Deploys futuros**: la estrategia red-primero para archivos locales hace que las
  versiones nuevas lleguen solas con internet; no hay que subir la versión del caché
  salvo que cambie la LISTA de archivos precargados (agregar/quitar archivos → subir a
  `orden-servicio-v2` para forzar reprecarga).
