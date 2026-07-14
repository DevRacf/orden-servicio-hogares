# Orden de Servicio Digital — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app para que Hogares Inteligentes cree órdenes de servicio en oficina, las complete el técnico en sitio con firmas, y genere un PDF compartible por WhatsApp.

**Architecture:** Sitio estático (HTML/CSS/JS con módulos ES, mobile-first) para GitHub Pages. Capa de datos intercambiable: modo `demo` (localStorage, para desarrollo y verificación local) y modo `supabase` (Postgres + Auth, producción). PDF y firmas se generan en el navegador.

**Tech Stack:** JavaScript vanilla (módulos ES), Supabase JS v2 (CDN), signature_pad v4 (CDN), jsPDF v2 (CDN), `node --test` para lógica pura, `python3 -m http.server` para desarrollo.

**Spec:** `docs/superpowers/specs/2026-07-14-orden-servicio-digital-design.md`

**Convenciones:** Código y UI en español. Nombres de funciones en español (`crearOrden`, `iniciarSesion`). Commits en español.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Cascarón único con las 4 vistas (login, lista, nueva, orden) y CDNs |
| `css/styles.css` | Estilos mobile-first |
| `js/config.js` | Modo (demo/supabase), credenciales Supabase, correo fijo de login |
| `js/ordenes.js` | Lógica pura: validaciones, materiales, orden de listas, etiquetas, fechas |
| `js/datos-demo.js` | Capa de datos en localStorage (desarrollo) |
| `js/datos-supabase.js` | Capa de datos real (producción) |
| `js/datos.js` | Selector de capa según config |
| `js/firma.js` | Canvas de firma (envuelve signature_pad) |
| `js/pdf.js` | Armado y generación del PDF con jsPDF |
| `js/app.js` | Router por hash, render de vistas, manejo de formularios |
| `tests/ordenes.test.js` | Pruebas de lógica pura (`node --test`) |
| `tests/pdf.test.js` | Pruebas del contenido del PDF |
| `supabase/schema.sql` | Tablas, secuencia de folio, RLS |
| `README.md` | Puesta en marcha: Supabase + GitHub Pages |
| `.claude/launch.json` | Servidor de desarrollo para el Browser pane |
| `package.json` | `"type": "module"` y script de pruebas |

---

### Task 1: Base del proyecto

**Files:**
- Create: `package.json`
- Create: `.claude/launch.json`
- Create: `js/config.js`
- Create: `index.html`
- Create: `css/styles.css`

- [ ] **Step 1: Crear `package.json`**

```json
{
  "name": "orden-servicio-hogares",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: Crear `.claude/launch.json`**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "orden-servicio",
      "runtimeExecutable": "python3",
      "runtimeArgs": ["-m", "http.server", "8123"],
      "port": 8123
    }
  ]
}
```

- [ ] **Step 3: Crear `js/config.js`**

```js
export const CONFIG = {
  // 'demo' usa localStorage (desarrollo). 'supabase' usa la base real (producción).
  MODO: 'demo',
  SUPABASE_URL: 'PENDIENTE',
  SUPABASE_ANON_KEY: 'PENDIENTE',
  // Correo de la cuenta única compartida en Supabase Auth; la clave que
  // escribe el usuario es la contraseña de esta cuenta.
  LOGIN_EMAIL: 'ordenes@hogaresinteligentes.app',
  CLAVE_DEMO: 'demo'
};
```

- [ ] **Step 4: Crear `index.html`** (cascarón completo; el JS se conecta en tareas posteriores)

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Órdenes de Servicio — Hogares Inteligentes</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <header class="encabezado">
    <span class="marca">Hogares Inteligentes</span>
    <button id="btn-salir" class="oculto liga" type="button">Salir</button>
  </header>

  <main id="app">
    <!-- Vista: entrar -->
    <section id="vista-login" class="vista oculto">
      <h2>Orden de servicio</h2>
      <form id="form-login">
        <label for="clave">Clave de acceso</label>
        <input type="password" id="clave" required autocomplete="current-password">
        <p id="error-login" class="error oculto"></p>
        <button type="submit">Entrar</button>
      </form>
    </section>

    <!-- Vista: lista de órdenes -->
    <section id="vista-lista" class="vista oculto">
      <a href="#/nueva" class="boton">+ Nueva orden</a>
      <h2>Pendientes</h2>
      <div id="lista-pendientes"></div>
      <h2>Completadas</h2>
      <div id="lista-completadas"></div>
    </section>

    <!-- Vista: nueva orden -->
    <section id="vista-nueva" class="vista oculto">
      <a href="#/" class="volver">← Órdenes</a>
      <h2>Nueva orden</h2>
      <form id="form-nueva">
        <label>Nombre del cliente
          <input name="cliente_nombre" required>
        </label>
        <label>Teléfono
          <input name="cliente_telefono" type="tel">
        </label>
        <label>Dirección
          <textarea name="cliente_direccion" rows="2" required></textarea>
        </label>
        <label>Tipo de cliente
          <select name="tipo_cliente">
            <option value="hogar">Hogar</option>
            <option value="empresa">Empresa</option>
          </select>
        </label>
        <label>Tipo de servicio
          <select name="tipo_servicio">
            <option value="camaras">Cámaras</option>
            <option value="audio">Audio</option>
            <option value="internet">Internet</option>
            <option value="pantallas">Pantallas</option>
            <option value="mantenimiento">Mantenimiento</option>
            <option value="otro">Otro</option>
          </select>
        </label>
        <label>Descripción de lo solicitado
          <textarea name="descripcion" rows="3"></textarea>
        </label>
        <label>Técnico asignado
          <select name="tecnico" id="select-tecnico"></select>
        </label>
        <p id="error-nueva" class="error oculto"></p>
        <button type="submit">Crear orden</button>
      </form>
    </section>

    <!-- Vista: detalle / completar orden -->
    <section id="vista-orden" class="vista oculto">
      <a href="#/" class="volver">← Órdenes</a>
      <div id="orden-datos"></div>
      <form id="form-completar" class="oculto">
        <h3>Trabajo realizado</h3>
        <textarea id="trabajo-realizado" rows="4"
          placeholder="Describe lo que se instaló o reparó"></textarea>
        <h3>Materiales y equipos</h3>
        <div id="filas-materiales"></div>
        <button type="button" id="btn-agregar-material" class="liga">+ Agregar material</button>
        <h3>Firma del técnico</h3>
        <canvas id="firma-tecnico" class="firma"></canvas>
        <button type="button" data-limpia="tecnico" class="liga">Limpiar firma</button>
        <h3>Firma del cliente</h3>
        <canvas id="firma-cliente" class="firma"></canvas>
        <button type="button" data-limpia="cliente" class="liga">Limpiar firma</button>
        <p id="error-completar" class="error oculto"></p>
        <button type="submit">Guardar y completar</button>
      </form>
      <button id="btn-pdf" class="oculto" type="button">Descargar / compartir PDF</button>
    </section>
  </main>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/signature_pad@4/dist/signature_pad.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2/dist/jspdf.umd.min.js"></script>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 5: Crear `css/styles.css`**

```css
:root {
  --azul: #0f3057;
  --azul-claro: #00587a;
  --acento: #008891;
  --fondo: #f4f7f9;
  --texto: #1c2b36;
  --gris: #7a8a99;
  --rojo: #c0392b;
  --blanco: #ffffff;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--fondo);
  color: var(--texto);
}

.encabezado {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--azul);
  color: var(--blanco);
  padding: 0.8rem 1rem;
}

.marca { font-weight: 700; letter-spacing: 0.02em; }

main { max-width: 640px; margin: 0 auto; padding: 1rem; }

.oculto { display: none !important; }

h2 { font-size: 1.15rem; margin: 1.2rem 0 0.6rem; }
h3 { font-size: 1rem; margin: 1.2rem 0 0.4rem; }

form label { display: block; margin-bottom: 0.8rem; font-weight: 600; font-size: 0.9rem; }

input, textarea, select {
  display: block;
  width: 100%;
  margin-top: 0.3rem;
  padding: 0.6rem;
  font: inherit;
  font-weight: 400;
  border: 1px solid #c8d3dc;
  border-radius: 8px;
  background: var(--blanco);
}

button, .boton {
  display: inline-block;
  width: 100%;
  padding: 0.75rem 1rem;
  margin-top: 0.5rem;
  font: inherit;
  font-weight: 600;
  color: var(--blanco);
  background: var(--acento);
  border: none;
  border-radius: 8px;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
}

button.liga {
  width: auto;
  background: none;
  color: var(--azul-claro);
  padding: 0.3rem 0;
  font-weight: 600;
}

.volver { display: inline-block; margin-bottom: 0.5rem; color: var(--azul-claro); text-decoration: none; font-weight: 600; }

.error { color: var(--rojo); font-size: 0.9rem; }
.vacio { color: var(--gris); font-size: 0.9rem; }

.tarjeta {
  display: block;
  background: var(--blanco);
  border: 1px solid #dfe7ed;
  border-radius: 10px;
  padding: 0.8rem;
  margin-bottom: 0.6rem;
  color: inherit;
  text-decoration: none;
}
.tarjeta span { display: block; color: var(--gris); font-size: 0.85rem; margin-top: 0.2rem; }

.estado { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 99px; vertical-align: middle; }
.estado.pendiente { background: #fff3cd; color: #7a5c00; }
.estado.completada { background: #d7f5e3; color: #14683c; }

dl { background: var(--blanco); border: 1px solid #dfe7ed; border-radius: 10px; padding: 0.8rem; margin: 0; }
dt { font-size: 0.78rem; color: var(--gris); text-transform: uppercase; letter-spacing: 0.03em; margin-top: 0.6rem; }
dt:first-child { margin-top: 0; }
dd { margin: 0.1rem 0 0; }

.fila-material { display: flex; gap: 0.4rem; margin-bottom: 0.4rem; }
.fila-material .cantidad { width: 5rem; flex: none; }
.fila-material .quitar { width: 2.6rem; flex: none; margin-top: 0.3rem; background: #e5ecf1; color: var(--texto); }

canvas.firma {
  width: 100%;
  height: 160px;
  background: var(--blanco);
  border: 1px dashed #9fb2c0;
  border-radius: 8px;
  touch-action: none;
}
```

- [ ] **Step 6: Commit**

```bash
git add package.json .claude/launch.json js/config.js index.html css/styles.css
git commit -m "Base del proyecto: cascarón HTML, estilos y configuración"
```

---

### Task 2: Lógica pura de órdenes (TDD)

**Files:**
- Test: `tests/ordenes.test.js`
- Create: `js/ordenes.js`

- [ ] **Step 1: Escribir las pruebas (deben fallar)** — `tests/ordenes.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPOS_SERVICIO, TIPOS_CLIENTE,
  validarNuevaOrden, limpiarMateriales, validarCierre,
  ordenarParaLista, formatearFecha
} from '../js/ordenes.js';

test('validarNuevaOrden acepta una orden completa', () => {
  const r = validarNuevaOrden({
    cliente_nombre: 'Juan Pérez',
    cliente_direccion: 'Av. Siempre Viva 123',
    tipo_cliente: 'hogar',
    tipo_servicio: 'camaras',
    tecnico: 'Carlos'
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
});

test('validarNuevaOrden junta un error por cada campo obligatorio faltante', () => {
  const r = validarNuevaOrden({ cliente_nombre: '  ', tipo_cliente: 'oficina' });
  assert.equal(r.ok, false);
  assert.equal(r.errores.length, 5);
});

test('limpiarMateriales descarta filas vacías o inválidas y normaliza', () => {
  const filas = [
    { cantidad: '2', descripcion: ' Cámara domo 1080p ' },
    { cantidad: '', descripcion: '' },
    { cantidad: '0', descripcion: 'Cable UTP' },
    { cantidad: 'abc', descripcion: 'DVR' }
  ];
  assert.deepEqual(limpiarMateriales(filas), [
    { cantidad: 2, descripcion: 'Cámara domo 1080p' }
  ]);
  assert.deepEqual(limpiarMateriales(undefined), []);
});

test('validarCierre exige trabajo realizado y firma del cliente', () => {
  const r = validarCierre({ trabajo_realizado: ' ', firma_cliente: null });
  assert.equal(r.ok, false);
  assert.equal(r.errores.length, 2);
  const ok = validarCierre({
    trabajo_realizado: 'Instalación de 4 cámaras',
    firma_cliente: 'data:image/png;base64,xyz'
  });
  assert.equal(ok.ok, true);
});

test('ordenarParaLista separa por estado con las más recientes primero', () => {
  const ordenes = [
    { id: 'a', estado: 'completada', created_at: '2026-07-01T10:00:00Z', completed_at: '2026-07-02T10:00:00Z' },
    { id: 'b', estado: 'pendiente', created_at: '2026-07-03T10:00:00Z' },
    { id: 'c', estado: 'pendiente', created_at: '2026-07-05T10:00:00Z' },
    { id: 'd', estado: 'completada', created_at: '2026-07-01T09:00:00Z', completed_at: '2026-07-06T10:00:00Z' }
  ];
  const { pendientes, completadas } = ordenarParaLista(ordenes);
  assert.deepEqual(pendientes.map(o => o.id), ['c', 'b']);
  assert.deepEqual(completadas.map(o => o.id), ['d', 'a']);
});

test('formatearFecha regresa vacío sin fecha y texto legible con fecha', () => {
  assert.equal(formatearFecha(null), '');
  assert.match(formatearFecha('2026-07-14T12:00:00Z'), /2026/);
});

test('las etiquetas cubren todos los valores del esquema', () => {
  assert.deepEqual(Object.keys(TIPOS_SERVICIO),
    ['camaras', 'audio', 'internet', 'pantallas', 'mantenimiento', 'otro']);
  assert.deepEqual(Object.keys(TIPOS_CLIENTE), ['hogar', 'empresa']);
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/ordenes.js'`

- [ ] **Step 3: Implementar `js/ordenes.js`**

```js
export const TIPOS_SERVICIO = {
  camaras: 'Cámaras',
  audio: 'Audio',
  internet: 'Internet',
  pantallas: 'Pantallas',
  mantenimiento: 'Mantenimiento',
  otro: 'Otro'
};

export const TIPOS_CLIENTE = {
  hogar: 'Hogar',
  empresa: 'Empresa'
};

export function validarNuevaOrden(d) {
  const errores = [];
  if (!d.cliente_nombre?.trim()) errores.push('El nombre del cliente es obligatorio');
  if (!d.cliente_direccion?.trim()) errores.push('La dirección es obligatoria');
  if (!TIPOS_CLIENTE[d.tipo_cliente]) errores.push('Elige hogar o empresa');
  if (!TIPOS_SERVICIO[d.tipo_servicio]) errores.push('Elige el tipo de servicio');
  if (!d.tecnico?.trim()) errores.push('Asigna un técnico');
  return { ok: errores.length === 0, errores };
}

export function limpiarMateriales(filas) {
  return (filas || [])
    .map(f => ({
      cantidad: Number(f.cantidad),
      descripcion: (f.descripcion || '').trim()
    }))
    .filter(f => f.descripcion && Number.isFinite(f.cantidad) && f.cantidad > 0);
}

export function validarCierre(d) {
  const errores = [];
  if (!d.trabajo_realizado?.trim()) errores.push('Describe el trabajo realizado');
  if (!d.firma_cliente) errores.push('Falta la firma del cliente');
  return { ok: errores.length === 0, errores };
}

export function ordenarParaLista(ordenes) {
  const recientesPrimero = (campo) => (a, b) => (a[campo] < b[campo] ? 1 : -1);
  return {
    pendientes: ordenes.filter(o => o.estado === 'pendiente').sort(recientesPrimero('created_at')),
    completadas: ordenes.filter(o => o.estado === 'completada').sort(recientesPrimero('completed_at'))
  };
}

export function formatearFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS — 7 pruebas en verde

- [ ] **Step 5: Commit**

```bash
git add tests/ordenes.test.js js/ordenes.js
git commit -m "Lógica pura de órdenes: validaciones, materiales, listas y fechas"
```

---

### Task 3: Capa de datos (demo y Supabase)

Ambas capas exponen la misma interfaz (todo `async`): `iniciarSesion(clave)`,
`haySesion()`, `cerrarSesion()`, `listarTecnicos()`, `listarOrdenes()`,
`obtenerOrden(id)`, `crearOrden(datos)`, `completarOrden(id, cierre)`.
No hay pruebas unitarias aquí (localStorage y Supabase no existen en Node);
se verifica en navegador en las tareas 4–7.

**Files:**
- Create: `js/datos-demo.js`
- Create: `js/datos-supabase.js`
- Create: `js/datos.js`

- [ ] **Step 1: Crear `js/datos-demo.js`**

```js
import { CONFIG } from './config.js';

const LLAVE_ORDENES = 'demo_ordenes';
const LLAVE_FOLIO = 'demo_folio';
const LLAVE_SESION = 'demo_sesion';
const TECNICOS_DEMO = ['Carlos Ramírez', 'Miguel Torres', 'Luis Ortega'];

function leerOrdenes() {
  return JSON.parse(localStorage.getItem(LLAVE_ORDENES) || '[]');
}

function guardarOrdenes(ordenes) {
  localStorage.setItem(LLAVE_ORDENES, JSON.stringify(ordenes));
}

export async function iniciarSesion(clave) {
  if (clave !== CONFIG.CLAVE_DEMO) return { ok: false, error: 'Clave incorrecta' };
  localStorage.setItem(LLAVE_SESION, '1');
  return { ok: true };
}

export async function haySesion() {
  return localStorage.getItem(LLAVE_SESION) === '1';
}

export async function cerrarSesion() {
  localStorage.removeItem(LLAVE_SESION);
}

export async function listarTecnicos() {
  return TECNICOS_DEMO;
}

export async function listarOrdenes() {
  return leerOrdenes();
}

export async function obtenerOrden(id) {
  return leerOrdenes().find(o => o.id === id) || null;
}

export async function crearOrden(datos) {
  const ordenes = leerOrdenes();
  const n = Number(localStorage.getItem(LLAVE_FOLIO) || '0') + 1;
  localStorage.setItem(LLAVE_FOLIO, String(n));
  const orden = {
    id: crypto.randomUUID(),
    folio: 'OS-' + String(n).padStart(4, '0'),
    estado: 'pendiente',
    created_at: new Date().toISOString(),
    trabajo_realizado: null,
    materiales: [],
    firma_tecnico: null,
    firma_cliente: null,
    completed_at: null,
    ...datos
  };
  ordenes.push(orden);
  guardarOrdenes(ordenes);
  return orden;
}

export async function completarOrden(id, cierre) {
  const ordenes = leerOrdenes();
  const orden = ordenes.find(o => o.id === id);
  if (!orden) throw new Error('Orden no encontrada');
  Object.assign(orden, cierre, {
    estado: 'completada',
    completed_at: new Date().toISOString()
  });
  guardarOrdenes(ordenes);
  return orden;
}
```

- [ ] **Step 2: Crear `js/datos-supabase.js`**

El cliente se crea de forma diferida (dentro de la función) para que importar el
módulo no truene cuando `SUPABASE_URL` sigue en `PENDIENTE` (modo demo).

```js
import { CONFIG } from './config.js';

let cliente = null;

function obtenerCliente() {
  if (!cliente) {
    cliente = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return cliente;
}

export async function iniciarSesion(clave) {
  const { error } = await obtenerCliente().auth.signInWithPassword({
    email: CONFIG.LOGIN_EMAIL,
    password: clave
  });
  if (error) return { ok: false, error: 'Clave incorrecta' };
  return { ok: true };
}

export async function haySesion() {
  const { data } = await obtenerCliente().auth.getSession();
  return Boolean(data.session);
}

export async function cerrarSesion() {
  await obtenerCliente().auth.signOut();
}

export async function listarTecnicos() {
  const { data, error } = await obtenerCliente()
    .from('tecnicos').select('nombre').eq('activo', true).order('nombre');
  if (error) throw error;
  return data.map(t => t.nombre);
}

export async function listarOrdenes() {
  const { data, error } = await obtenerCliente()
    .from('ordenes').select('*');
  if (error) throw error;
  return data;
}

export async function obtenerOrden(id) {
  const { data, error } = await obtenerCliente()
    .from('ordenes').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function crearOrden(datos) {
  const { data, error } = await obtenerCliente()
    .from('ordenes').insert(datos).select().single();
  if (error) throw error;
  return data;
}

export async function completarOrden(id, cierre) {
  const { data, error } = await obtenerCliente()
    .from('ordenes')
    .update({ ...cierre, estado: 'completada', completed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 3: Crear `js/datos.js`**

```js
import { CONFIG } from './config.js';
import * as demo from './datos-demo.js';
import * as supabase from './datos-supabase.js';

const impl = CONFIG.MODO === 'supabase' ? supabase : demo;

export const {
  iniciarSesion, haySesion, cerrarSesion,
  listarTecnicos, listarOrdenes, obtenerOrden,
  crearOrden, completarOrden
} = impl;
```

- [ ] **Step 4: Commit**

```bash
git add js/datos-demo.js js/datos-supabase.js js/datos.js
git commit -m "Capa de datos con modo demo (localStorage) y modo Supabase"
```

---

### Task 4: Login, sesión y router

**Files:**
- Create: `js/app.js` (primera versión: router + login + salir)

- [ ] **Step 1: Crear `js/app.js`**

```js
import * as datos from './datos.js';

const $ = (sel) => document.querySelector(sel);

const VISTAS = ['vista-login', 'vista-lista', 'vista-nueva', 'vista-orden'];

function mostrarVista(id) {
  for (const v of VISTAS) document.getElementById(v).classList.toggle('oculto', v !== id);
}

function mostrarError(idParrafo, mensajes) {
  const p = document.getElementById(idParrafo);
  p.textContent = Array.isArray(mensajes) ? mensajes.join('. ') : mensajes;
  p.classList.remove('oculto');
}

function limpiarError(idParrafo) {
  document.getElementById(idParrafo).classList.add('oculto');
}

async function rutear() {
  try {
    if (!(await datos.haySesion())) {
      $('#btn-salir').classList.add('oculto');
      mostrarVista('vista-login');
      return;
    }
    $('#btn-salir').classList.remove('oculto');
    const hash = location.hash || '#/';
    const m = hash.match(/^#\/orden\/(.+)$/);
    if (hash === '#/nueva') { await renderNueva(); return; }
    if (m) { await renderOrden(m[1]); return; }
    await renderLista();
  } catch (err) {
    // Cualquier lectura del backend (listarOrdenes, listarTecnicos, obtenerOrden,
    // haySesion) puede rechazar en modo Supabase por falta de conexión; en modo
    // demo esto nunca ocurre, así que solo se ejerce contra Supabase real.
    console.error(err);
    mostrarVista('vista-lista');
    $('#lista-pendientes').innerHTML =
      '<p class="error">No se pudo conectar. Revisa tu conexión e intenta de nuevo.</p>';
    $('#lista-completadas').innerHTML = '';
  }
}

// Placeholders que las tareas 5 y 6 reemplazan por renders reales:
async function renderLista() { mostrarVista('vista-lista'); }
async function renderNueva() { mostrarVista('vista-nueva'); }
async function renderOrden(id) { mostrarVista('vista-orden'); }

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await datos.iniciarSesion($('#clave').value);
  if (!r.ok) return mostrarError('error-login', r.error);
  $('#clave').value = '';
  limpiarError('error-login');
  location.hash = '#/';
  rutear();
});

$('#btn-salir').addEventListener('click', async () => {
  await datos.cerrarSesion();
  location.hash = '#/';
  rutear();
});

window.addEventListener('hashchange', rutear);
rutear();
```

- [ ] **Step 2: Verificar en navegador**

Arrancar el servidor `orden-servicio` (preview_start) y abrir `http://localhost:8123`.
- Sin sesión: se ve la vista de login.
- Clave equivocada (`xxx`): aparece "Clave incorrecta".
- Clave `demo`: pasa a la vista de lista (vacía) y aparece el botón "Salir".
- "Salir" regresa al login.
- Consola sin errores.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "Router por hash, login con clave compartida y cierre de sesión"
```

---

### Task 5: Lista de órdenes y nueva orden

**Files:**
- Modify: `js/app.js` (reemplazar los placeholders `renderLista` y `renderNueva`, agregar submit de nueva orden y helpers)

- [ ] **Step 1: Agregar imports de lógica pura al inicio de `js/app.js`**

```js
import {
  TIPOS_SERVICIO, TIPOS_CLIENTE,
  validarNuevaOrden, validarCierre, limpiarMateriales,
  ordenarParaLista, formatearFecha
} from './ordenes.js';
```

- [ ] **Step 2: Reemplazar los placeholders `renderLista` y `renderNueva` con las versiones reales**

```js
function escapar(texto) {
  const d = document.createElement('div');
  d.textContent = texto ?? '';
  return d.innerHTML;
}

function tarjetaOrden(o) {
  return `<a class="tarjeta" href="#/orden/${o.id}">
    <strong>${o.folio}</strong> · ${escapar(o.cliente_nombre)}
    <span>${TIPOS_SERVICIO[o.tipo_servicio] || ''} — ${escapar(o.tecnico)}</span>
  </a>`;
}

async function renderLista() {
  mostrarVista('vista-lista');
  const { pendientes, completadas } = ordenarParaLista(await datos.listarOrdenes());
  $('#lista-pendientes').innerHTML =
    pendientes.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes pendientes</p>';
  $('#lista-completadas').innerHTML =
    completadas.map(tarjetaOrden).join('') || '<p class="vacio">Sin órdenes completadas</p>';
}

async function renderNueva() {
  mostrarVista('vista-nueva');
  const tecnicos = await datos.listarTecnicos();
  $('#select-tecnico').innerHTML =
    tecnicos.map(t => `<option>${escapar(t)}</option>`).join('');
}
```

- [ ] **Step 3: Agregar el manejo del formulario de nueva orden (junto a los otros listeners)**

```js
$('#form-nueva').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const v = validarNuevaOrden(d);
  if (!v.ok) return mostrarError('error-nueva', v.errores);
  limpiarError('error-nueva');
  try {
    await datos.crearOrden(d);
  } catch {
    return mostrarError('error-nueva', 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
  }
  e.target.reset();
  location.hash = '#/';
});
```

- [ ] **Step 4: Verificar en navegador**

Recargar `http://localhost:8123` (sesión demo activa):
- "+ Nueva orden" abre el formulario con los 3 técnicos demo en el select.
- Enviar vacío: errores de validación visibles.
- Crear una orden completa: regresa a la lista y aparece la tarjeta con folio `OS-0001` en Pendientes.
- Crear una segunda orden: folio `OS-0002` y aparece arriba de la primera.
- Consola sin errores.

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "Lista de órdenes y creación de orden con folio consecutivo"
```

---

### Task 6: Firmas y completar orden

**Files:**
- Create: `js/firma.js`
- Modify: `js/app.js` (reemplazar placeholder `renderOrden`, agregar materiales, firmas y submit de cierre)

- [ ] **Step 1: Crear `js/firma.js`**

```js
// Envuelve signature_pad (cargado por CDN como window.SignaturePad)
// ajustando el canvas a la densidad de pantalla del dispositivo.
export function crearPad(canvas) {
  const pad = new window.SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });

  function redimensionar() {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const trazos = pad.toData();
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    pad.fromData(trazos);
  }

  redimensionar();

  return {
    limpiar: () => pad.clear(),
    vacia: () => pad.isEmpty(),
    imagen: () => pad.toDataURL('image/png')
  };
}
```

- [ ] **Step 2: En `js/app.js`, importar la firma y agregar estado + fila de material**

```js
import { crearPad } from './firma.js';
```

```js
let ordenActual = null;
let pads = null;

function filaMaterial() {
  const div = document.createElement('div');
  div.className = 'fila-material';
  div.innerHTML = `
    <input type="number" min="1" class="cantidad" placeholder="Cant.">
    <input type="text" class="descripcion" placeholder="Descripción / modelo">
    <button type="button" class="quitar" aria-label="Quitar fila">×</button>`;
  div.querySelector('.quitar').addEventListener('click', () => div.remove());
  return div;
}
```

- [ ] **Step 3: Reemplazar el placeholder `renderOrden` con la versión real**

```js
async function renderOrden(id) {
  mostrarVista('vista-orden');
  ordenActual = await datos.obtenerOrden(id);
  if (!ordenActual) { location.hash = '#/'; return; }
  const o = ordenActual;

  $('#orden-datos').innerHTML = `
    <h2>${o.folio} <span class="estado ${o.estado}">${o.estado}</span></h2>
    <dl>
      <dt>Cliente</dt><dd>${escapar(o.cliente_nombre)} (${TIPOS_CLIENTE[o.tipo_cliente] || ''})</dd>
      <dt>Teléfono</dt><dd>${escapar(o.cliente_telefono || '—')}</dd>
      <dt>Dirección</dt><dd>${escapar(o.cliente_direccion)}</dd>
      <dt>Servicio</dt><dd>${TIPOS_SERVICIO[o.tipo_servicio] || ''}</dd>
      <dt>Solicitado</dt><dd>${escapar(o.descripcion || '—')}</dd>
      <dt>Técnico</dt><dd>${escapar(o.tecnico)}</dd>
      <dt>Creada</dt><dd>${formatearFecha(o.created_at)}</dd>
      ${o.estado === 'completada' ? `
      <dt>Trabajo realizado</dt><dd>${escapar(o.trabajo_realizado)}</dd>
      <dt>Materiales</dt><dd>${(o.materiales || [])
        .map(m => `${m.cantidad} × ${escapar(m.descripcion)}`).join('<br>') || '—'}</dd>
      <dt>Cerrada</dt><dd>${formatearFecha(o.completed_at)}</dd>` : ''}
    </dl>`;

  const esPendiente = o.estado === 'pendiente';
  $('#form-completar').classList.toggle('oculto', !esPendiente);
  $('#btn-pdf').classList.toggle('oculto', esPendiente);

  if (esPendiente) {
    $('#trabajo-realizado').value = '';
    $('#filas-materiales').replaceChildren(filaMaterial());
    pads = {
      tecnico: crearPad(document.getElementById('firma-tecnico')),
      cliente: crearPad(document.getElementById('firma-cliente'))
    };
  }
}
```

- [ ] **Step 4: Agregar los listeners de completar (junto a los otros listeners)**

```js
$('#btn-agregar-material').addEventListener('click', () => {
  $('#filas-materiales').appendChild(filaMaterial());
});

document.querySelectorAll('[data-limpia]').forEach(b =>
  b.addEventListener('click', () => pads?.[b.dataset.limpia]?.limpiar()));

$('#form-completar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const filas = [...document.querySelectorAll('#filas-materiales .fila-material')].map(f => ({
    cantidad: f.querySelector('.cantidad').value,
    descripcion: f.querySelector('.descripcion').value
  }));
  const cierre = {
    trabajo_realizado: $('#trabajo-realizado').value,
    materiales: limpiarMateriales(filas),
    firma_tecnico: pads.tecnico.vacia() ? null : pads.tecnico.imagen(),
    firma_cliente: pads.cliente.vacia() ? null : pads.cliente.imagen()
  };
  const v = validarCierre(cierre);
  if (!v.ok) return mostrarError('error-completar', v.errores);
  limpiarError('error-completar');
  try {
    ordenActual = await datos.completarOrden(ordenActual.id, cierre);
  } catch {
    return mostrarError('error-completar', 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
  }
  location.hash = `#/orden/${ordenActual.id}`;
  rutear();
});
```

- [ ] **Step 5: Verificar en navegador**

- Abrir la orden `OS-0001` desde la lista: se ven los datos de oficina y el formulario de cierre.
- Enviar sin nada: errores "Describe el trabajo realizado. Falta la firma del cliente".
- Llenar trabajo, agregar 2 materiales (una fila válida, una vacía), dibujar ambas firmas (arrastre de mouse sobre el canvas), enviar.
- La orden pasa a vista completada: badge "completada", trabajo y solo el material válido visibles, botón de PDF visible.
- En la lista, la orden aparece ahora en Completadas.
- Consola sin errores.

- [ ] **Step 6: Commit**

```bash
git add js/firma.js js/app.js
git commit -m "Cierre de orden en sitio: materiales dinámicos y firmas en canvas"
```

---

### Task 7: PDF (TDD en el contenido)

**Files:**
- Test: `tests/pdf.test.js`
- Create: `js/pdf.js`
- Modify: `js/app.js` (botón PDF y compartir al completar)

- [ ] **Step 1: Escribir la prueba del contenido (debe fallar)** — `tests/pdf.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seccionesPdf } from '../js/pdf.js';

const orden = {
  folio: 'OS-0007',
  cliente_nombre: 'Ferretería El Martillo',
  cliente_telefono: '555 123 4567',
  cliente_direccion: 'Calle Hidalgo 45, Centro',
  tipo_cliente: 'empresa',
  tipo_servicio: 'camaras',
  tecnico: 'Carlos Ramírez',
  created_at: '2026-07-10T15:00:00Z',
  completed_at: '2026-07-14T18:30:00Z'
};

test('seccionesPdf arma los pares etiqueta/valor con etiquetas legibles', () => {
  const secciones = seccionesPdf(orden);
  const mapa = Object.fromEntries(secciones);
  assert.equal(mapa['Cliente'], 'Ferretería El Martillo');
  assert.equal(mapa['Tipo de cliente'], 'Empresa');
  assert.equal(mapa['Servicio'], 'Cámaras');
  assert.equal(mapa['Técnico'], 'Carlos Ramírez');
  assert.match(mapa['Fecha de cierre'], /2026/);
});

test('seccionesPdf usa guion para teléfono vacío', () => {
  const mapa = Object.fromEntries(seccionesPdf({ ...orden, cliente_telefono: null }));
  assert.equal(mapa['Teléfono'], '—');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../js/pdf.js'` (las 7 pruebas de ordenes siguen en verde)

- [ ] **Step 3: Implementar `js/pdf.js`**

`seccionesPdf` es puro (testeable en Node); `generarPdf`/`compartirPdf` usan
`window.jspdf` y solo se ejecutan en navegador.

```js
import { TIPOS_SERVICIO, TIPOS_CLIENTE, formatearFecha } from './ordenes.js';

export function seccionesPdf(orden) {
  return [
    ['Cliente', orden.cliente_nombre],
    ['Teléfono', orden.cliente_telefono || '—'],
    ['Dirección', orden.cliente_direccion],
    ['Tipo de cliente', TIPOS_CLIENTE[orden.tipo_cliente] || orden.tipo_cliente],
    ['Servicio', TIPOS_SERVICIO[orden.tipo_servicio] || orden.tipo_servicio],
    ['Técnico', orden.tecnico],
    ['Fecha de creación', formatearFecha(orden.created_at)],
    ['Fecha de cierre', formatearFecha(orden.completed_at)]
  ];
}

function bloqueTexto(doc, titulo, texto, y, margen, ancho) {
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, margen, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  const lineas = doc.splitTextToSize(texto || '—', ancho);
  doc.text(lineas, margen, y);
  return y + lineas.length * 5 + 6;
}

export function generarPdf(orden) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'letter' }); // carta: 216 x 279 mm
  const MARGEN = 16;
  const DERECHA = 216 - MARGEN;
  const ANCHO = DERECHA - MARGEN;
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Hogares Inteligentes', MARGEN, y);
  doc.setFontSize(13);
  doc.text(orden.folio, DERECHA, y, { align: 'right' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Orden de servicio — cámaras, audio, internet y pantallas', MARGEN, y);
  y += 4;
  doc.line(MARGEN, y, DERECHA, y);
  y += 9;

  doc.setFontSize(11);
  for (const [etiqueta, valor] of seccionesPdf(orden)) {
    doc.setFont('helvetica', 'bold');
    doc.text(etiqueta + ':', MARGEN, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(valor ?? '—'), MARGEN + 44, y);
    y += 7;
  }
  y += 3;

  y = bloqueTexto(doc, 'Descripción solicitada', orden.descripcion, y, MARGEN, ANCHO);
  y = bloqueTexto(doc, 'Trabajo realizado', orden.trabajo_realizado, y, MARGEN, ANCHO);

  doc.setFont('helvetica', 'bold');
  doc.text('Materiales y equipos', MARGEN, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  const materiales = orden.materiales || [];
  if (materiales.length === 0) {
    doc.text('—', MARGEN, y);
    y += 6;
  }
  for (const m of materiales) {
    doc.text(`${m.cantidad} × ${m.descripcion}`, MARGEN, y);
    y += 6;
  }

  // Firmas al pie (nueva página si el contenido bajó demasiado)
  if (y > 225) { doc.addPage(); y = 30; } else { y = Math.max(y + 10, 225); }
  const ANCHO_FIRMA = 70;
  const ALTO_FIRMA = 25;
  if (orden.firma_tecnico) {
    doc.addImage(orden.firma_tecnico, 'PNG', MARGEN, y, ANCHO_FIRMA, ALTO_FIRMA);
  }
  if (orden.firma_cliente) {
    doc.addImage(orden.firma_cliente, 'PNG', DERECHA - ANCHO_FIRMA, y, ANCHO_FIRMA, ALTO_FIRMA);
  }
  y += ALTO_FIRMA + 3;
  doc.line(MARGEN, y, MARGEN + ANCHO_FIRMA, y);
  doc.line(DERECHA - ANCHO_FIRMA, y, DERECHA, y);
  y += 5;
  doc.setFontSize(9);
  doc.text(`Técnico: ${orden.tecnico}`, MARGEN, y);
  doc.text(`Cliente: ${orden.cliente_nombre}`, DERECHA - ANCHO_FIRMA, y);

  return doc;
}

export async function compartirPdf(orden) {
  const doc = generarPdf(orden);
  const nombre = `${orden.folio}.pdf`;
  const archivo = new File([doc.output('blob')], nombre, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return;
    } catch {
      // usuario canceló el diálogo de compartir: no es error
      return;
    }
  }
  doc.save(nombre);
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npm test`
Expected: PASS — 9 pruebas en verde

- [ ] **Step 5: Conectar en `js/app.js`**

Import:

```js
import { compartirPdf } from './pdf.js';
```

Listener (junto a los demás):

```js
$('#btn-pdf').addEventListener('click', () => compartirPdf(ordenActual));
```

Y en el submit de `#form-completar`, después de `completarOrden` y antes de
cambiar el hash, ofrecer el PDF de inmediato:

```js
  await compartirPdf(ordenActual);
```

- [ ] **Step 6: Verificar en navegador**

- Abrir una orden completada y pulsar "Descargar / compartir PDF": en escritorio descarga `OS-0001.pdf`.
- Abrir el PDF descargado: encabezado con folio, datos completos, materiales y las dos firmas dibujadas sobre sus líneas.
- Completar una orden nueva de principio a fin: el PDF se ofrece al guardar.
- Consola sin errores.

- [ ] **Step 7: Commit**

```bash
git add tests/pdf.test.js js/pdf.js js/app.js
git commit -m "PDF de la orden con firmas y compartir por Web Share / descarga"
```

---

### Task 8: Verificación completa y pulido móvil

**Files:**
- Modify: solo lo que la verificación exija corregir

- [ ] **Step 1: Correr todas las pruebas**

Run: `npm test`
Expected: PASS — 9 pruebas en verde

- [ ] **Step 2: Flujo completo en vista móvil (375px)**

Redimensionar el Browser pane a 375×812 y recorrer todo con datos nuevos:
1. Salir y volver a entrar con la clave.
2. Crear una orden (cliente empresa, servicio pantallas).
3. Abrirla, llenar cierre con 3 materiales y firmas táctiles, guardar.
4. Generar el PDF y revisarlo.
5. Verificar que nada se desborde horizontalmente y los botones sean cómodos al tacto.

- [ ] **Step 3: Revisión de consola y red**

`read_console_messages` sin errores; `read_network_requests` solo con los CDNs y archivos locales esperados.

- [ ] **Step 4: Corregir lo que haya salido y commit**

```bash
git add -A
git commit -m "Pulido móvil tras verificación end-to-end"
```

(Si no hubo correcciones, omitir el commit.)

---

### Task 9: Esquema de Supabase y guía de puesta en marcha

**Files:**
- Create: `supabase/schema.sql`
- Create: `README.md`

- [ ] **Step 1: Crear `supabase/schema.sql`**

```sql
-- Esquema de la orden de servicio digital — Hogares Inteligentes
-- Correr completo en: Supabase → SQL Editor → New query → Run

create sequence if not exists folio_seq start 1;

create table if not exists tecnicos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true
);

create table if not exists ordenes (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('OS-' || lpad(nextval('folio_seq')::text, 4, '0')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'completada')),
  created_at timestamptz not null default now(),
  cliente_nombre text not null,
  cliente_telefono text,
  cliente_direccion text not null,
  tipo_cliente text not null check (tipo_cliente in ('hogar', 'empresa')),
  tipo_servicio text not null check (tipo_servicio in
    ('camaras', 'audio', 'internet', 'pantallas', 'mantenimiento', 'otro')),
  descripcion text,
  tecnico text not null,
  trabajo_realizado text,
  materiales jsonb not null default '[]'::jsonb,
  firma_tecnico text,
  firma_cliente text,
  completed_at timestamptz
);

alter table tecnicos enable row level security;
alter table ordenes enable row level security;

create policy "leer tecnicos autenticado" on tecnicos
  for select to authenticated using (true);

create policy "leer ordenes autenticado" on ordenes
  for select to authenticated using (true);

create policy "crear ordenes autenticado" on ordenes
  for insert to authenticated with check (true);

create policy "actualizar ordenes autenticado" on ordenes
  for update to authenticated using (true);

-- Técnicos iniciales: edita los nombres reales aquí o después en Table Editor
insert into tecnicos (nombre) values ('Técnico 1'), ('Técnico 2');
```

- [ ] **Step 2: Crear `README.md`**

```markdown
# Orden de Servicio Digital — Hogares Inteligentes

Web app para crear órdenes de servicio en oficina, completarlas en sitio con la
firma del cliente y generar un PDF listo para compartir por WhatsApp.

## Desarrollo local (modo demo)

No necesita nada más que un servidor estático:

    python3 -m http.server 8123

Abrir <http://localhost:8123>. Clave de acceso: `demo`. Los datos se guardan en
localStorage del navegador.

## Puesta en marcha en producción

1. **Supabase** (gratis): crear cuenta y proyecto en <https://supabase.com>.
2. **Esquema**: en SQL Editor, pegar y correr `supabase/schema.sql`.
3. **Técnicos**: en Table Editor → `tecnicos`, poner los nombres reales.
4. **Cuenta compartida**: en Authentication → Users → *Add user*, crear el
   usuario `ordenes@hogaresinteligentes.app` con la clave que usará el equipo
   (marcar *Auto confirm user*).
5. **Config**: en `js/config.js` poner `MODO: 'supabase'`, y copiar de
   Settings → API el `SUPABASE_URL` (Project URL) y `SUPABASE_ANON_KEY`
   (anon public). La llave anon es pública por diseño; los datos quedan
   protegidos por Row Level Security.
6. **GitHub Pages**: subir el repositorio a GitHub y activar
   Settings → Pages → Deploy from branch → `main` → `/ (root)`.
7. Compartir la URL con la oficina y los técnicos junto con la clave.

## Administración

- **Técnicos**: agregar/desactivar en Supabase → Table Editor → `tecnicos`
  (columna `activo`).
- **Cambiar la clave**: Supabase → Authentication → Users → reset password.

## Pruebas

    npm test
```

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql README.md
git commit -m "Esquema de Supabase y guía de puesta en marcha"
```

---

## Notas para quien ejecute

- El modo `demo` existe para poder construir y verificar todo el flujo sin
  credenciales; **la app se entrega en modo demo** y Andre hace el cambio a
  Supabase siguiendo el README (crear cuentas es un paso que debe hacer él).
- `signature_pad` necesita `touch-action: none` en el canvas (ya está en el CSS)
  para que la firma no haga scroll en el celular.
- Los folios en demo y en Supabase usan el mismo formato `OS-0001`; en
  producción los asigna la secuencia de Postgres, nunca el cliente.
