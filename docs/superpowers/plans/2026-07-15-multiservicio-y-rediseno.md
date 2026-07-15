# Múltiples servicios + rediseño "Técnico en Campo" — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir marcar varios servicios por orden (hoy solo admite uno) y aplicar el
rediseño visual "Técnico en Campo" (navy + ámbar, Manrope/Inter, bordes de 2px) a las 4
pantallas de la app ya construida.

**Architecture:** Se reemplaza el campo `tipo_servicio` (texto) por `servicios` (arreglo)
en todo el flujo de datos — formulario, tarjetas, detalle, PDF y esquema de Supabase (aún
no desplegado, sin datos reales que migrar). El rediseño visual es un cambio de piel
(tokens CSS + tipografía) sin tocar estructura, routing ni lógica de negocio.

**Tech Stack:** El mismo del proyecto — JavaScript vanilla (módulos ES), `node --test`,
Postgres/Supabase, Google Fonts (Manrope + Inter) vía CDN.

**Spec:** `docs/superpowers/specs/2026-07-15-multiservicio-y-rediseno-design.md`

**Convenciones:** Igual que el resto del proyecto — español en código/UI, commits en
español, TDD para lógica pura.

---

## Estructura de archivos afectados

| Archivo | Cambio |
|---|---|
| `js/ordenes.js` | Nueva función `etiquetasServicios`; `validarNuevaOrden` exige arreglo `servicios` no vacío en vez de `tipo_servicio` |
| `tests/ordenes.test.js` | Pruebas nuevas/actualizadas para lo anterior |
| `js/pdf.js` | `seccionesPdf` usa `etiquetasServicios` para el renglón "Servicios" |
| `tests/pdf.test.js` | Pruebas actualizadas para el renglón "Servicios" |
| `supabase/schema.sql` | Columna `tipo_servicio` → `servicios text[]` con su check |
| `index.html` | Select de servicio → 6 casillas agrupadas; se agregan los `<link>` de Google Fonts |
| `js/app.js` | Recolecta `servicios` del formulario como arreglo; `tarjetaOrden`/`renderOrden` muestran etiquetas de servicios |
| `css/styles.css` | Reescritura completa con los tokens y tipografía del rediseño |

---

### Task 1: Lógica pura de servicios múltiples (TDD)

**Files:**
- Modify: `js/ordenes.js`
- Test: `tests/ordenes.test.js`

- [ ] **Step 1: Actualizar `tests/ordenes.test.js`** — reemplazar el archivo completo por:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIPOS_SERVICIO, TIPOS_CLIENTE,
  validarNuevaOrden, limpiarMateriales, validarCierre,
  ordenarParaLista, formatearFecha, etiquetasServicios
} from '../js/ordenes.js';

test('validarNuevaOrden acepta una orden completa', () => {
  const r = validarNuevaOrden({
    cliente_nombre: 'Juan Pérez',
    cliente_direccion: 'Av. Siempre Viva 123',
    tipo_cliente: 'hogar',
    servicios: ['camaras'],
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

test('validarNuevaOrden exige al menos un servicio', () => {
  const base = {
    cliente_nombre: 'Juan Pérez',
    cliente_direccion: 'Av. Siempre Viva 123',
    tipo_cliente: 'hogar',
    tecnico: 'Carlos'
  };
  const sinServicios = validarNuevaOrden({ ...base, servicios: [] });
  assert.equal(sinServicios.ok, false);
  assert.ok(sinServicios.errores.includes('Selecciona al menos un servicio'));

  const conServicios = validarNuevaOrden({ ...base, servicios: ['audio', 'internet'] });
  assert.equal(conServicios.ok, true);
});

test('etiquetasServicios traduce claves a etiquetas legibles', () => {
  assert.deepEqual(etiquetasServicios(['camaras', 'internet']), ['Cámaras', 'Internet']);
  assert.deepEqual(etiquetasServicios(undefined), []);
  assert.deepEqual(etiquetasServicios(['camaras', 'desconocido']), ['Cámaras', 'desconocido']);
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

- [ ] **Step 2: Correr las pruebas y confirmar que fallan**

Run: `npm test`
Expected: FAIL — `tests/ordenes.test.js` no puede importar `etiquetasServicios` (no existe
todavía en `js/ordenes.js`); los 2 tests de `tests/pdf.test.js` siguen en verde
(no se han tocado).

- [ ] **Step 3: Actualizar `js/ordenes.js`** — reemplazar el archivo completo por:

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

export function etiquetasServicios(servicios) {
  return (servicios || []).map(s => TIPOS_SERVICIO[s] || s);
}

export function validarNuevaOrden(d) {
  const errores = [];
  if (!d.cliente_nombre?.trim()) errores.push('El nombre del cliente es obligatorio');
  if (!d.cliente_direccion?.trim()) errores.push('La dirección es obligatoria');
  if (!TIPOS_CLIENTE[d.tipo_cliente]) errores.push('Elige hogar o empresa');
  if (!Array.isArray(d.servicios) || d.servicios.length === 0) errores.push('Selecciona al menos un servicio');
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

- [ ] **Step 4: Correr las pruebas y confirmar que pasan**

Run: `npm test`
Expected: PASS — 11 pruebas en verde (9 de `ordenes.test.js` + 2 de `pdf.test.js`, sin
tocar todavía).

- [ ] **Step 5: Commit**

```bash
git add js/ordenes.js tests/ordenes.test.js
git commit -m "Permitir varios servicios por orden en la lógica de validación"
```

---

### Task 2: PDF con varios servicios (TDD)

**Files:**
- Modify: `js/pdf.js`
- Test: `tests/pdf.test.js`

- [ ] **Step 1: Actualizar `tests/pdf.test.js`** — reemplazar el archivo completo por:

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
  servicios: ['camaras', 'internet'],
  tecnico: 'Carlos Ramírez',
  created_at: '2026-07-10T15:00:00Z',
  completed_at: '2026-07-14T18:30:00Z'
};

test('seccionesPdf arma los pares etiqueta/valor con etiquetas legibles', () => {
  const secciones = seccionesPdf(orden);
  const mapa = Object.fromEntries(secciones);
  assert.equal(mapa['Cliente'], 'Ferretería El Martillo');
  assert.equal(mapa['Tipo de cliente'], 'Empresa');
  assert.equal(mapa['Servicios'], 'Cámaras, Internet');
  assert.equal(mapa['Técnico'], 'Carlos Ramírez');
  assert.match(mapa['Fecha de cierre'], /2026/);
});

test('seccionesPdf usa guion para teléfono vacío', () => {
  const mapa = Object.fromEntries(seccionesPdf({ ...orden, cliente_telefono: null }));
  assert.equal(mapa['Teléfono'], '—');
});

test('seccionesPdf junta un solo servicio sin coma de sobra', () => {
  const mapa = Object.fromEntries(seccionesPdf({ ...orden, servicios: ['pantallas'] }));
  assert.equal(mapa['Servicios'], 'Pantallas');
});
```

- [ ] **Step 2: Correr las pruebas y confirmar que fallan**

Run: `npm test`
Expected: FAIL — los 3 tests de `tests/pdf.test.js` fallan porque `seccionesPdf` todavía
regresa la etiqueta `'Servicio'` (singular, desde `tipo_servicio`) en vez de
`'Servicios'`. Los 9 tests de `ordenes.test.js` siguen en verde.

- [ ] **Step 3: Modificar `js/pdf.js`** — reemplazar la línea de import y la función
  `seccionesPdf` (líneas 1–14 del archivo actual):

```js
import { TIPOS_CLIENTE, formatearFecha, etiquetasServicios } from './ordenes.js';

export function seccionesPdf(orden) {
  return [
    ['Cliente', orden.cliente_nombre],
    ['Teléfono', orden.cliente_telefono || '—'],
    ['Dirección', orden.cliente_direccion],
    ['Tipo de cliente', TIPOS_CLIENTE[orden.tipo_cliente] || orden.tipo_cliente],
    ['Servicios', etiquetasServicios(orden.servicios).join(', ')],
    ['Técnico', orden.tecnico],
    ['Fecha de creación', formatearFecha(orden.created_at)],
    ['Fecha de cierre', formatearFecha(orden.completed_at)]
  ];
}
```

  El resto del archivo (`bloqueTexto`, `generarPdf`, `compartirPdf`) no cambia.

- [ ] **Step 4: Correr las pruebas y confirmar que pasan**

Run: `npm test`
Expected: PASS — 12 pruebas en verde (9 de `ordenes.test.js` + 3 de `pdf.test.js`).

- [ ] **Step 5: Commit**

```bash
git add js/pdf.js tests/pdf.test.js
git commit -m "PDF: mostrar varios servicios en el renglón Servicios"
```

---

### Task 3: Esquema de Supabase — columna `servicios`

**Files:**
- Modify: `supabase/schema.sql`

No hay pruebas automatizadas para SQL (no se ejecuta contra una base real desde aquí,
igual que en la construcción original). La verificación es una lectura cuidadosa más un
grep de confirmación.

- [ ] **Step 1: Reemplazar la columna `tipo_servicio` en `supabase/schema.sql`**

Cambiar:

```sql
  tipo_servicio text not null check (tipo_servicio in
    ('camaras', 'audio', 'internet', 'pantallas', 'mantenimiento', 'otro')),
```

por:

```sql
  -- coalesce(...,0) es necesario porque array_length() regresa NULL (no 0)
  -- para un arreglo vacío, y un check que da NULL se considera válido en
  -- Postgres — sin el coalesce, un arreglo vacío pasaría el check.
  servicios text[] not null check (
    coalesce(array_length(servicios, 1), 0) > 0 and
    servicios <@ array['camaras','audio','internet','pantallas','mantenimiento','otro']::text[]
  ),
```

El resto del archivo (`tecnicos`, el resto de columnas de `ordenes`, las políticas RLS,
el seed de técnicos) no cambia.

- [ ] **Step 2: Confirmar que no queda ninguna referencia a `tipo_servicio` en el código**

Run: `grep -rn "tipo_servicio" js/ index.html supabase/ tests/`
Expected: sin resultados (todas las referencias ya se movieron a `servicios` en las
Tareas 1 y 2; esta tarea completa la última).

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "Esquema: columna servicios (arreglo) en vez de tipo_servicio"
```

---

### Task 4: Formulario y visualización de varios servicios

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/styles.css`

- [ ] **Step 1: Reemplazar el select de servicio en `index.html`**

Cambiar (dentro de `<form id="form-nueva">`):

```html
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
```

por:

```html
        <fieldset class="servicios-campo">
          <legend>Servicios solicitados</legend>
          <div class="chips">
            <label class="chip">
              <input type="checkbox" name="servicios" value="camaras">
              <span>Cámaras</span>
            </label>
            <label class="chip">
              <input type="checkbox" name="servicios" value="audio">
              <span>Audio</span>
            </label>
            <label class="chip">
              <input type="checkbox" name="servicios" value="internet">
              <span>Internet</span>
            </label>
            <label class="chip">
              <input type="checkbox" name="servicios" value="pantallas">
              <span>Pantallas</span>
            </label>
            <label class="chip">
              <input type="checkbox" name="servicios" value="mantenimiento">
              <span>Mantenimiento</span>
            </label>
            <label class="chip">
              <input type="checkbox" name="servicios" value="otro">
              <span>Otro</span>
            </label>
          </div>
        </fieldset>
```

- [ ] **Step 2: Agregar estilos mínimos para las casillas en `css/styles.css`**

Agregar al final del archivo (estos usan los tokens actuales; la Tarea 5 los redefine,
así que el aspecto final de estas mismas reglas cambia automáticamente ahí):

```css
fieldset.servicios-campo { border: none; padding: 0; margin: 0 0 0.8rem; }
fieldset.servicios-campo legend { font-weight: 600; font-size: 0.9rem; margin-bottom: 0.4rem; padding: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid #c8d3dc;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--texto);
  background: var(--blanco);
  cursor: pointer;
  min-height: 44px;
}
.chip input[type="checkbox"] { all: revert; width: 1.1rem; height: 1.1rem; margin: 0; cursor: pointer; }
.chip:has(input:checked) { background: var(--acento); border-color: var(--acento); color: var(--blanco); }

.etiquetas-servicio { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.3rem; }
.etiquetas-servicio .etiqueta {
  font-size: 0.72rem;
  font-weight: 500;
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
  background: var(--fondo);
  color: var(--gris);
  border: 1px solid #dfe7ed;
}
```

- [ ] **Step 3: Actualizar el import de `js/ordenes.js` en `js/app.js`**

Cambiar (líneas 2–6):

```js
import {
  TIPOS_SERVICIO, TIPOS_CLIENTE,
  validarNuevaOrden, validarCierre, limpiarMateriales,
  ordenarParaLista, formatearFecha
} from './ordenes.js';
```

por:

```js
import {
  TIPOS_CLIENTE,
  validarNuevaOrden, validarCierre, limpiarMateriales,
  ordenarParaLista, formatearFecha, etiquetasServicios
} from './ordenes.js';
```

(Ya no se usa `TIPOS_SERVICIO` directo en este archivo — `tarjetaOrden` y `renderOrden`
pasan a usar `etiquetasServicios`, que lo consulta internamente.)

- [ ] **Step 4: Actualizar `tarjetaOrden` en `js/app.js`**

Cambiar:

```js
function tarjetaOrden(o) {
  return `<a class="tarjeta" href="#/orden/${o.id}">
    <strong>${escapar(o.folio)}</strong> · ${escapar(o.cliente_nombre)}
    <span>${TIPOS_SERVICIO[o.tipo_servicio] || ''} — ${escapar(o.tecnico)}</span>
  </a>`;
}
```

por:

```js
function tarjetaOrden(o) {
  const etiquetas = etiquetasServicios(o.servicios).map(e => `<span class="etiqueta">${escapar(e)}</span>`).join('');
  return `<a class="tarjeta" href="#/orden/${o.id}">
    <strong>${escapar(o.folio)}</strong> · ${escapar(o.cliente_nombre)}
    <div class="etiquetas-servicio">${etiquetas}</div>
    <span>${escapar(o.tecnico)}</span>
  </a>`;
}
```

- [ ] **Step 5: Actualizar el renglón de servicio en `renderOrden` (`js/app.js`)**

Cambiar:

```js
      <dt>Servicio</dt><dd>${TIPOS_SERVICIO[o.tipo_servicio] || ''}</dd>
```

por:

```js
      <dt>Servicios</dt><dd>${etiquetasServicios(o.servicios).map(e => escapar(e)).join(', ')}</dd>
```

- [ ] **Step 6: Actualizar la recolección del formulario en el submit de `#form-nueva`
  (`js/app.js`)**

Cambiar:

```js
$('#form-nueva').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const v = validarNuevaOrden(d);
```

por:

```js
$('#form-nueva').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const d = Object.fromEntries(form);
  d.servicios = form.getAll('servicios');
  const v = validarNuevaOrden(d);
```

(`Object.fromEntries` solo se queda con el último valor de un campo repetido, por eso
`servicios` — que puede tener varias casillas marcadas con el mismo `name` — se recolecta
aparte con `getAll`.)

- [ ] **Step 7: Verificar en navegador**

Arrancar el servidor (`python3 -m http.server 8123` en la carpeta del proyecto) y abrir
`http://localhost:8123` con la clave `demo`:
- "+ Nueva orden": aparecen las 6 casillas de servicio agrupadas bajo "Servicios
  solicitados".
- Enviar sin marcar ninguna: aparece el error "Selecciona al menos un servicio" (junto a
  los demás errores de campos vacíos si tampoco se llenaron).
- Marcar 3 casillas (ej. Cámaras, Internet, Pantallas) y completar el resto del
  formulario: al guardar, la tarjeta en la lista muestra las 3 etiquetas.
- Abrir esa orden: el detalle muestra "Servicios" con las 3 etiquetas separadas por coma.
- Completar la orden con firmas y descargar el PDF: el renglón "Servicios" del PDF
  muestra las 3 etiquetas separadas por coma (se puede confirmar generando el PDF con
  `javascript_tool` e inspeccionando el texto, o abriendo el PDF descargado).
- Consola sin errores.

- [ ] **Step 8: Commit**

```bash
git add index.html js/app.js css/styles.css
git commit -m "Permitir marcar varios servicios al crear una orden"
```

---

### Task 5: Rediseño visual "Técnico en Campo"

**Files:**
- Modify: `index.html` (fuentes de Google Fonts)
- Modify: `css/styles.css` (reescritura completa)

- [ ] **Step 1: Agregar las fuentes en `index.html`**

Agregar justo después de `<link rel="stylesheet" href="css/styles.css">`:

```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Reemplazar todo el contenido de `css/styles.css`**

```css
:root {
  --azul: #0B2545;
  --acento: #D97706;
  --fondo: #F4F6F5;
  --texto: #0B2545;
  --gris: #5c6b78;
  --rojo: #c0392b;
  --blanco: #ffffff;
  --pendiente-fondo: #FEF3C7;
  --pendiente-texto: #92400E;
  --completada-fondo: #D7F5E3;
  --completada-texto: #14683C;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: 'Inter', -apple-system, "Segoe UI", Roboto, sans-serif;
  background: var(--fondo);
  color: var(--texto);
}

.encabezado {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--azul);
  color: var(--blanco);
  padding: 0.9rem 1rem;
}

.marca {
  font-family: 'Manrope', -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 1.1rem;
  margin: 0;
  font-weight: 800;
  letter-spacing: 0.02em;
}

main { max-width: 640px; margin: 0 auto; padding: 1rem; }

.oculto { display: none !important; }

h2, h3 { font-family: 'Manrope', -apple-system, "Segoe UI", Roboto, sans-serif; font-weight: 700; }
h2 { font-size: 1.2rem; margin: 1.2rem 0 0.6rem; }
h3 { font-size: 1.05rem; margin: 1.2rem 0 0.4rem; }

form label { display: block; margin-bottom: 0.9rem; font-weight: 600; font-size: 0.92rem; }

input, textarea, select {
  display: block;
  width: 100%;
  margin-top: 0.35rem;
  padding: 0.75rem;
  font: inherit;
  font-weight: 400;
  border: 2px solid var(--azul);
  border-radius: 10px;
  background: var(--blanco);
  color: var(--texto);
}

button, .boton {
  display: inline-block;
  width: 100%;
  padding: 0.9rem 1rem;
  margin-top: 0.5rem;
  font-family: 'Manrope', -apple-system, "Segoe UI", Roboto, sans-serif;
  font-weight: 800;
  font-size: 0.98rem;
  color: var(--azul);
  background: var(--acento);
  border: none;
  border-radius: 10px;
  text-align: center;
  text-decoration: none;
  cursor: pointer;
  min-height: 48px;
}

button.liga {
  width: auto;
  min-height: auto;
  background: none;
  color: var(--azul);
  padding: 0.6rem 0;
  font-family: 'Manrope', -apple-system, "Segoe UI", Roboto, sans-serif;
  font-weight: 700;
}

.encabezado .liga { color: var(--acento); }

.volver {
  display: inline-block;
  margin-bottom: 0.5rem;
  color: var(--azul);
  font-family: 'Manrope', -apple-system, "Segoe UI", Roboto, sans-serif;
  text-decoration: none;
  font-weight: 700;
}

.error { color: var(--rojo); font-size: 0.9rem; font-weight: 600; }
.vacio { color: var(--gris); font-size: 0.9rem; }

.tarjeta {
  display: block;
  background: var(--blanco);
  border: 2px solid var(--azul);
  border-radius: 12px;
  padding: 0.9rem;
  margin-bottom: 0.7rem;
  color: inherit;
  text-decoration: none;
}
.tarjeta strong { font-family: 'Manrope', -apple-system, "Segoe UI", Roboto, sans-serif; }
.tarjeta > span { display: block; color: var(--gris); font-size: 0.85rem; margin-top: 0.3rem; }

.estado {
  font-family: 'Manrope', -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 99px;
  vertical-align: middle;
}
.estado.pendiente { background: var(--pendiente-fondo); color: var(--pendiente-texto); }
.estado.completada { background: var(--completada-fondo); color: var(--completada-texto); }

.etiquetas-servicio { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem; }
.etiquetas-servicio .etiqueta {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.18rem 0.55rem;
  border-radius: 6px;
  background: var(--fondo);
  color: var(--azul);
  border: 1px solid var(--azul);
}

dl { background: var(--blanco); border: 2px solid var(--azul); border-radius: 12px; padding: 0.9rem; margin: 0; }
dt {
  font-family: 'Manrope', -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 0.78rem;
  color: var(--gris);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-top: 0.7rem;
  font-weight: 700;
}
dt:first-child { margin-top: 0; }
dd { margin: 0.15rem 0 0; }

fieldset.servicios-campo { border: none; padding: 0; margin: 0 0 0.9rem; }
fieldset.servicios-campo legend { font-weight: 600; font-size: 0.92rem; margin-bottom: 0.4rem; padding: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.chip {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 0.8rem;
  border: 2px solid var(--azul);
  border-radius: 10px;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--azul);
  background: var(--blanco);
  cursor: pointer;
  min-height: 44px;
}
.chip input[type="checkbox"] { all: revert; width: 1.1rem; height: 1.1rem; margin: 0; cursor: pointer; }
.chip:has(input:checked) { background: var(--acento); border-color: var(--acento); color: var(--azul); }

.fila-material { display: flex; gap: 0.4rem; margin-bottom: 0.5rem; }
.fila-material .cantidad { width: 5rem; flex: none; }
.fila-material .quitar {
  width: 2.8rem;
  flex: none;
  margin-top: 0.35rem;
  min-height: auto;
  background: var(--fondo);
  border: 2px solid var(--azul);
  color: var(--azul);
}

canvas.firma {
  width: 100%;
  height: 160px;
  background: var(--blanco);
  border: 2px dashed var(--azul);
  border-radius: 10px;
  touch-action: none;
}
```

- [ ] **Step 3: Verificar tipografía y contraste en navegador**

Arrancar el servidor y abrir `http://localhost:8123`. Con `javascript_tool`:

```js
getComputedStyle(document.querySelector('.marca')).fontFamily
// debe incluir 'Manrope'
getComputedStyle(document.body).fontFamily
// debe incluir 'Inter'
```

Confirmar visualmente (captura de pantalla) que el botón "Entrar" se ve con fondo ámbar
y texto azul marino legible (no blanco sobre ámbar — el texto azul da más contraste).

- [ ] **Step 4: Recorrido completo de regresión, escritorio y móvil**

Con datos nuevos, primero en escritorio y luego con `resize_window` a 375×812:
1. Entrar con la clave `demo`.
2. Crear una orden marcando 2 o 3 servicios.
3. Abrirla, llenar cierre con materiales y ambas firmas, guardar.
4. Confirmar que el PDF se genera sin errores y que el estado pasa a "completada" con el
   badge en el color nuevo (fondo verde claro, texto verde oscuro).
5. Verificar que nada se desborde horizontalmente en 375px
   (`document.documentElement.scrollWidth` == `window.innerWidth`).
6. `read_console_messages` sin errores en ningún paso.

- [ ] **Step 5: Correr las pruebas unitarias una vez más**

Run: `npm test`
Expected: PASS — 12 pruebas en verde (sin cambios respecto a la Tarea 2; este paso solo
confirma que el rediseño visual no rompió nada en la lógica).

- [ ] **Step 6: Commit**

```bash
git add index.html css/styles.css
git commit -m "Rediseño visual Técnico en Campo: navy + ámbar, Manrope/Inter, bordes de 2px"
```

---

## Notas para quien ejecute

- El selector CSS `:has()` (usado en `.chip:has(input:checked)`) tiene soporte amplio en
  navegadores modernos (Chrome/Edge/Safari/Firefox desde 2023-2024) — suficiente para
  celulares actuales de los técnicos. Aun si algún navegador viejo no lo soportara, la
  casilla nativa sigue mostrando su propio check, así que la función no se pierde, solo
  el color de fondo del chip.
- La Tarea 4 deja los chips con los colores viejos (acento teal) a propósito — es
  funcional pero no es el look final. La Tarea 5 los redefine automáticamente al
  reescribir los tokens en `:root`, sin tocar el HTML/JS de nuevo.
- No hay datos reales en producción todavía, así que no se necesita ninguna migración —
  si esto cambiara antes de ejecutar el plan, avisar antes de tocar `supabase/schema.sql`.
