# Dos niveles de acceso: oficina y técnicos — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Segunda cuenta compartida de acceso para técnicos, que solo pueden
completar órdenes ya creadas por la oficina (trabajo, materiales, firmas) sin
poder crear órdenes ni editar cliente/servicios/técnico asignado — bloqueado
también del lado del servidor, no solo en la pantalla.

**Architecture:** Tabla `perfiles` en Supabase que asocia cada cuenta con un
rol (`oficina` o `tecnico`). Las políticas RLS de `ordenes` restringen
creación/edición directa a `oficina`; el cierre de una orden pasa por una
función `completar_orden` (security definer) que es la única puerta para esa
acción y solo toca las columnas del cierre, sin importar quién la llame. El
login sigue teniendo un solo campo de clave: la app prueba primero la cuenta
de oficina y si no coincide prueba la de técnicos.

**Tech Stack:** El mismo del proyecto — JavaScript vanilla (módulos ES),
Supabase (Postgres + Auth + RLS), `node --test`.

**Spec:** `docs/superpowers/specs/2026-07-27-roles-oficina-tecnicos-design.md`

**Rama:** Crear `desarrollo` desde `main` antes de la primera tarea
(`git checkout -b desarrollo`). No trabajar directo en `main`.

**Convenciones:** Igual que el resto del proyecto — español en código/UI,
commits en español con trailer
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## Estructura de archivos

| Archivo | Cambio |
|---|---|
| `supabase/schema.sql` | Tabla `perfiles`, políticas de `ordenes` actualizadas, función `completar_orden` — versión para instalaciones nuevas |
| `supabase/migracion-roles.sql` | Nuevo: script para aplicar el mismo cambio a la base ya en producción, sin perder datos |
| `js/config.js` | Nuevo `LOGIN_EMAIL_TECNICOS` |
| `js/datos-supabase.js` | `iniciarSesion` prueba dos cuentas; nueva `obtenerRol`; `completarOrden` usa la función en vez de `update` directo |
| `js/offline.js` | Reexporta `obtenerRol` |
| `js/datos.js` | Reexporta `obtenerRol` |
| `js/datos-demo.js` | `obtenerRol` fijo en `'oficina'` (modo demo sigue siendo acceso completo) |
| `index.html` | `id` en el enlace "+ Nueva orden" para poder ocultarlo |
| `js/app.js` | Guarda el rol de la sesión, oculta "+ Nueva orden" y bloquea la ruta `#/nueva` para técnicos |
| `README.md` | Pasos de puesta en marcha para instalaciones nuevas y para actualizar la ya existente |

---

### Task 1: Esquema de Supabase — perfiles, RLS y función `completar_orden`

**Files:**
- Modify: `supabase/schema.sql`
- Create: `supabase/migracion-roles.sql`

No hay pruebas automatizadas para SQL (no se ejecuta contra una base real
desde aquí, igual que en la construcción original). La verificación es una
lectura cuidadosa más un grep de confirmación.

- [ ] **Step 0: Crear la rama de trabajo (solo si no existe ya)**

```bash
git checkout -b desarrollo
```

- [ ] **Step 1: Reemplazar `supabase/schema.sql` completo**

Contenido nuevo del archivo completo:

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
  -- coalesce(...,0) es necesario porque array_length() regresa NULL (no 0)
  -- para un arreglo vacío, y un check que da NULL se considera válido en
  -- Postgres — sin el coalesce, un arreglo vacío pasaría el check.
  servicios text[] not null check (
    coalesce(array_length(servicios, 1), 0) > 0 and
    servicios <@ array['camaras','audio','internet','pantallas','mantenimiento','otro']::text[]
  ),
  descripcion text,
  tecnico text not null,
  trabajo_realizado text,
  materiales jsonb not null default '[]'::jsonb,
  firma_tecnico text,
  firma_cliente text,
  completed_at timestamptz
);

-- Un perfil por cada cuenta de Supabase Auth (oficina o técnicos), para saber
-- qué puede hacer cada una. Ver README para los pasos de puesta en marcha.
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('oficina', 'tecnico'))
);

alter table tecnicos enable row level security;
alter table ordenes enable row level security;
alter table perfiles enable row level security;

create policy "leer tecnicos autenticado" on tecnicos
  for select to authenticated using (true);

create policy "leer ordenes autenticado" on ordenes
  for select to authenticated using (true);

create policy "crear ordenes solo oficina" on ordenes
  for insert to authenticated with check (
    exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  );

create policy "actualizar ordenes solo oficina" on ordenes
  for update to authenticated using (
    exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  );

create policy "leer mi propio perfil" on perfiles
  for select to authenticated using (auth.uid() = id);

-- Única puerta para cerrar una orden (tanto oficina como técnicos la usan):
-- solo toca estas columnas, sin importar qué le manden — así se puede dar
-- acceso a técnicos sin que puedan tocar cliente, servicios, etc.
create or replace function completar_orden(
  p_id uuid,
  p_trabajo_realizado text,
  p_materiales jsonb,
  p_firma_tecnico text,
  p_firma_cliente text,
  p_completed_at timestamptz
) returns ordenes
language plpgsql
security definer
set search_path = public
as $$
declare
  resultado ordenes;
begin
  if not exists (select 1 from perfiles where id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  update ordenes set
    trabajo_realizado = p_trabajo_realizado,
    materiales = p_materiales,
    firma_tecnico = p_firma_tecnico,
    firma_cliente = p_firma_cliente,
    estado = 'completada',
    completed_at = coalesce(p_completed_at, now())
  where id = p_id and estado = 'pendiente'
  returning * into resultado;

  if resultado is null then
    raise exception 'Orden no encontrada o ya completada';
  end if;

  return resultado;
end;
$$;

grant execute on function completar_orden(uuid, text, jsonb, text, text, timestamptz) to authenticated;

-- Técnicos iniciales: edita los nombres reales aquí o después en Table Editor
insert into tecnicos (nombre) values ('Técnico 1'), ('Técnico 2');
```

- [ ] **Step 2: Crear `supabase/migracion-roles.sql`**

Este archivo es para aplicar el cambio a la base que ya está en producción
(con datos reales), sin necesidad de recrear nada. Contenido completo:

```sql
-- Migración: dos niveles de acceso (oficina y técnicos)
-- Seguro de correr sobre la base ya en producción: no borra ni modifica
-- órdenes ni técnicos existentes.
--
-- PASO 1 — correr esto primero, en: Supabase → SQL Editor → New query → Run

create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('oficina', 'tecnico'))
);

alter table perfiles enable row level security;

drop policy if exists "leer mi propio perfil" on perfiles;
create policy "leer mi propio perfil" on perfiles
  for select to authenticated using (auth.uid() = id);

-- Da de alta el perfil de oficina automáticamente (la cuenta ya existe desde
-- la puesta en marcha original) — no hace falta copiar ningún ID a mano.
insert into perfiles (id, rol)
select id, 'oficina' from auth.users where email = 'ordenes@hogaresinteligentes.app'
on conflict (id) do nothing;

drop policy if exists "crear ordenes autenticado" on ordenes;
drop policy if exists "actualizar ordenes autenticado" on ordenes;

create policy "crear ordenes solo oficina" on ordenes
  for insert to authenticated with check (
    exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  );

create policy "actualizar ordenes solo oficina" on ordenes
  for update to authenticated using (
    exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  );

create or replace function completar_orden(
  p_id uuid,
  p_trabajo_realizado text,
  p_materiales jsonb,
  p_firma_tecnico text,
  p_firma_cliente text,
  p_completed_at timestamptz
) returns ordenes
language plpgsql
security definer
set search_path = public
as $$
declare
  resultado ordenes;
begin
  if not exists (select 1 from perfiles where id = auth.uid()) then
    raise exception 'No autorizado';
  end if;

  update ordenes set
    trabajo_realizado = p_trabajo_realizado,
    materiales = p_materiales,
    firma_tecnico = p_firma_tecnico,
    firma_cliente = p_firma_cliente,
    estado = 'completada',
    completed_at = coalesce(p_completed_at, now())
  where id = p_id and estado = 'pendiente'
  returning * into resultado;

  if resultado is null then
    raise exception 'Orden no encontrada o ya completada';
  end if;

  return resultado;
end;
$$;

grant execute on function completar_orden(uuid, text, jsonb, text, text, timestamptz) to authenticated;

-- PASO 2 — correr esto DESPUÉS de crear la cuenta de técnicos en
-- Authentication → Users (ver README). Antes de eso fallará porque la cuenta
-- todavía no existe.

insert into perfiles (id, rol)
select id, 'tecnico' from auth.users where email = 'tecnicos@hogaresinteligentes.app'
on conflict (id) do nothing;
```

- [ ] **Step 3: Confirmar que las políticas viejas no quedan referenciadas en ningún lado del código**

Run: `grep -rn "actualizar ordenes autenticado\|crear ordenes autenticado" supabase/ js/ index.html tests/`
Expected: sin resultados en `supabase/schema.sql` ni `supabase/migracion-roles.sql` fuera de los
`drop policy if exists` del script de migración (ahí sí deben aparecer, es
intencional).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql supabase/migracion-roles.sql
git commit -m "Esquema: tabla perfiles, RLS por rol y función completar_orden"
```

---

### Task 2: `js/config.js` — segunda cuenta

**Files:**
- Modify: `js/config.js`

- [ ] **Step 1: Agregar `LOGIN_EMAIL_TECNICOS` y aclarar el comentario existente**

El archivo completo queda:

```js
export const CONFIG = {
  // 'demo' usa localStorage (desarrollo). 'supabase' usa la base real (producción).
  MODO: 'supabase',
  SUPABASE_URL: 'https://govvkxcdmvaahdcncizw.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvdnZreGNkbXZhYWhkY25jaXp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMzk4NDgsImV4cCI6MjA5OTcxNTg0OH0.yCvOsSiTx3zGqewQ5ysg62tMTHa1Oh4oaMF3BCD2nM8',
  // Cuenta de oficina en Supabase Auth (acceso completo). La clave que
  // escribe el usuario es la contraseña de esta cuenta.
  LOGIN_EMAIL: 'ordenes@hogaresinteligentes.app',
  // Cuenta de técnicos (acceso restringido: solo completar órdenes ya
  // creadas). Se prueba si la clave no coincide con la cuenta de oficina.
  LOGIN_EMAIL_TECNICOS: 'tecnicos@hogaresinteligentes.app',
  CLAVE_DEMO: 'demo'
};
```

- [ ] **Step 2: Commit**

```bash
git add js/config.js
git commit -m "Config: correo de la cuenta de técnicos"
```

---

### Task 3: `js/datos-supabase.js` — login de dos cuentas, rol y cierre vía función

**Files:**
- Modify: `js/datos-supabase.js`

- [ ] **Step 1: Reemplazar `iniciarSesion`**

Cambiar:

```js
export async function iniciarSesion(clave) {
  const { error } = await obtenerCliente().auth.signInWithPassword({
    email: CONFIG.LOGIN_EMAIL,
    password: clave
  });
  if (error) return { ok: false, error: 'Clave incorrecta' };
  return { ok: true };
}
```

por:

```js
export async function iniciarSesion(clave) {
  const intentoOficina = await obtenerCliente().auth.signInWithPassword({
    email: CONFIG.LOGIN_EMAIL,
    password: clave
  });
  if (!intentoOficina.error) return { ok: true };

  const intentoTecnico = await obtenerCliente().auth.signInWithPassword({
    email: CONFIG.LOGIN_EMAIL_TECNICOS,
    password: clave
  });
  if (!intentoTecnico.error) return { ok: true };

  return { ok: false, error: 'Clave incorrecta' };
}
```

- [ ] **Step 2: Agregar `obtenerRol`** (después de `haySesion`)

```js
export async function obtenerRol() {
  const { data: sesion } = await obtenerCliente().auth.getSession();
  const uid = sesion.session?.user?.id;
  if (!uid) return 'tecnico';
  const { data, error } = await obtenerCliente()
    .from('perfiles').select('rol').eq('id', uid).maybeSingle();
  if (error) throw error;
  if (!data) {
    console.error('Sin perfil para la cuenta activa; se asume rol de técnico por seguridad.');
    return 'tecnico';
  }
  return data.rol;
}
```

- [ ] **Step 3: Reemplazar `completarOrden`**

Cambiar:

```js
export async function completarOrden(id, cierre) {
  const { data, error } = await obtenerCliente()
    .from('ordenes')
    .update({ ...cierre, estado: 'completada', completed_at: cierre.completed_at || new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

por:

```js
export async function completarOrden(id, cierre) {
  const { data, error } = await obtenerCliente().rpc('completar_orden', {
    p_id: id,
    p_trabajo_realizado: cierre.trabajo_realizado,
    p_materiales: cierre.materiales,
    p_firma_tecnico: cierre.firma_tecnico,
    p_firma_cliente: cierre.firma_cliente,
    p_completed_at: cierre.completed_at || new Date().toISOString()
  });
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Commit**

```bash
git add js/datos-supabase.js
git commit -m "Login de dos cuentas, rol de la sesión y cierre de orden vía función de Supabase"
```

---

### Task 4: Exponer `obtenerRol` en las demás capas de datos

**Files:**
- Modify: `js/offline.js`
- Modify: `js/datos.js`
- Modify: `js/datos-demo.js`

- [ ] **Step 1: En `js/offline.js`, agregar `obtenerRol` a la reexportación**

Cambiar la última línea del archivo:

```js
export const { iniciarSesion, haySesion, cerrarSesion, listarTecnicos, crearOrden } = sb;
```

por:

```js
export const { iniciarSesion, haySesion, cerrarSesion, listarTecnicos, crearOrden, obtenerRol } = sb;
```

- [ ] **Step 2: En `js/datos-demo.js`, agregar `obtenerRol`** (al final del archivo)

```js
// El modo demo es solo para desarrollo local; siempre acceso completo.
export async function obtenerRol() {
  return 'oficina';
}
```

- [ ] **Step 3: En `js/datos.js`, agregar `obtenerRol` a la reexportación**

Cambiar:

```js
export const {
  iniciarSesion, haySesion, cerrarSesion,
  listarTecnicos, listarOrdenes, obtenerOrden,
  crearOrden, completarOrden
} = impl;
```

por:

```js
export const {
  iniciarSesion, haySesion, cerrarSesion,
  listarTecnicos, listarOrdenes, obtenerOrden,
  crearOrden, completarOrden, obtenerRol
} = impl;
```

- [ ] **Step 4: Correr las pruebas para confirmar que nada se rompió**

Run: `npm test`
Expected: PASS — 19 en verde (sin cambios en la cuenta de pruebas; este
paquete de cambios no toca lógica pura).

- [ ] **Step 5: Commit**

```bash
git add js/offline.js js/datos.js js/datos-demo.js
git commit -m "Exponer obtenerRol en las capas de datos demo y offline"
```

---

### Task 5: Ocultar "Nueva orden" y bloquear la ruta para técnicos

**Files:**
- Modify: `index.html`
- Modify: `js/app.js`

- [ ] **Step 1: En `index.html`, agregar `id` al enlace de nueva orden**

Cambiar:

```html
      <a href="#/nueva" class="boton">+ Nueva orden</a>
```

por:

```html
      <a href="#/nueva" class="boton" id="link-nueva-orden">+ Nueva orden</a>
```

- [ ] **Step 2: En `js/app.js`, agregar el estado del rol** (junto a los demás `let` del módulo)

Cambiar:

```js
let ordenActual = null;
let pads = null;
let ordenesCargadas = [];
```

por:

```js
let ordenActual = null;
let pads = null;
let ordenesCargadas = [];
let rolActual = null;
```

- [ ] **Step 3: Agregar los helpers de rol** (antes de `async function rutear() {`)

```js
async function obtenerRolCacheado() {
  if (rolActual === null) rolActual = await datos.obtenerRol();
  return rolActual;
}

function actualizarVisibilidadPorRol() {
  $('#link-nueva-orden').classList.toggle('oculto', rolActual === 'tecnico');
}
```

- [ ] **Step 4: Reemplazar `rutear()`**

Cambiar:

```js
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
```

por:

```js
async function rutear() {
  try {
    if (!(await datos.haySesion())) {
      $('#btn-salir').classList.add('oculto');
      mostrarVista('vista-login');
      rolActual = null; // se vuelve a resolver en el siguiente login
      return;
    }
    $('#btn-salir').classList.remove('oculto');
    const hash = location.hash || '#/';
    if (hash === '#/nueva') {
      // Crear órdenes ya requería internet antes de este cambio (igual que
      // iniciar sesión); esperar el rol aquí no le quita nada al modo offline,
      // que solo cubre ver/completar órdenes ya cargadas.
      await obtenerRolCacheado();
      actualizarVisibilidadPorRol();
      if (rolActual === 'tecnico') { location.hash = '#/'; return; }
      await renderNueva();
      return;
    }
    // Para las demás rutas no se espera: no debe bloquear la navegación ni
    // romper el modo sin internet si todavía no hay red para resolver el rol.
    // Si falla, se reintenta solo en la siguiente llamada a rutear().
    obtenerRolCacheado().then(actualizarVisibilidadPorRol).catch(err => console.error(err));
    const m = hash.match(/^#\/orden\/(.+)$/);
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
```

- [ ] **Step 5: Correr las pruebas**

Run: `npm test`
Expected: PASS — 19 en verde (los cambios de este paso son de UI/router, sin
lógica pura nueva).

- [ ] **Step 6: Verificar en navegador, modo demo**

Servidor: `python3 -m http.server 8123` desde la raíz del repo. Entrar con la
clave `demo` (modo demo siempre da rol `'oficina'`): el botón "+ Nueva orden"
debe seguir apareciendo normal, y crear una orden debe funcionar igual que
antes. Esto confirma que el cambio no rompió el camino de oficina/demo;
probar el camino de técnico requiere la cuenta real de Supabase (Tarea 8).

- [ ] **Step 7: Commit**

```bash
git add index.html js/app.js
git commit -m "Ocultar Nueva orden y bloquear su ruta cuando el rol es técnico"
```

---

### Task 6: Documentar en el README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Reemplazar la sección "Puesta en marcha en producción"**

Cambiar:

```markdown
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
```

por:

```markdown
## Puesta en marcha en producción

1. **Supabase** (gratis): crear cuenta y proyecto en <https://supabase.com>.
2. **Esquema**: en SQL Editor, pegar y correr `supabase/schema.sql`.
3. **Técnicos**: en Table Editor → `tecnicos`, poner los nombres reales.
4. **Cuenta de oficina** (acceso completo): en Authentication → Users →
   *Add user*, crear el usuario `ordenes@hogaresinteligentes.app` con la
   clave que usará la oficina (marcar *Auto confirm user*).
5. **Cuenta de técnicos** (acceso restringido a completar órdenes): igual que
   el paso anterior, crear `tecnicos@hogaresinteligentes.app` con una clave
   distinta.
6. **Perfiles**: en SQL Editor, correr:

   ```sql
   insert into perfiles (id, rol)
   select id, 'oficina' from auth.users where email = 'ordenes@hogaresinteligentes.app'
   on conflict (id) do nothing;

   insert into perfiles (id, rol)
   select id, 'tecnico' from auth.users where email = 'tecnicos@hogaresinteligentes.app'
   on conflict (id) do nothing;
   ```

7. **Config**: en `js/config.js` poner `MODO: 'supabase'`, y copiar de
   Settings → API el `SUPABASE_URL` (Project URL) y `SUPABASE_ANON_KEY`
   (anon public). La llave anon es pública por diseño; los datos quedan
   protegidos por Row Level Security. Si se usaron correos distintos a los de
   arriba, actualizar `LOGIN_EMAIL` y `LOGIN_EMAIL_TECNICOS`.
8. **GitHub Pages**: subir el repositorio a GitHub y activar
   Settings → Pages → Deploy from branch → `main` → `/ (root)`.
9. Compartir la URL con la oficina (junto con su clave) y con los técnicos
   (junto con la suya, distinta).
```

- [ ] **Step 2: Agregar una sección nueva antes de "## Administración"**

```markdown
## Actualizar una instalación existente a dos roles

Si ya tenías la app funcionando con una sola cuenta (antes de que existiera
`perfiles`), no hace falta repetir la puesta en marcha completa:

1. En Supabase → SQL Editor, correr el **Paso 1** de
   `supabase/migracion-roles.sql` (da de alta el perfil de oficina solo, ya
   que esa cuenta ya existe).
2. Crear la cuenta de técnicos: Authentication → Users → *Add user*,
   `tecnicos@hogaresinteligentes.app` con su propia clave (marcar
   *Auto confirm user*).
3. Correr el **Paso 2** de `supabase/migracion-roles.sql` (da de alta el
   perfil de técnico, ahora que la cuenta ya existe).
4. Subir el código nuevo (este cambio) a producción y compartir la clave de
   técnicos con el equipo de campo.
```

- [ ] **Step 3: Actualizar "## Administración"**

Cambiar:

```markdown
## Administración

- **Técnicos**: agregar/desactivar en Supabase → Table Editor → `tecnicos`
  (columna `activo`).
- **Cambiar la clave**: Supabase → Authentication → Users → reset password.
```

por:

```markdown
## Administración

- **Técnicos** (nombres que aparecen en el dropdown de una orden):
  agregar/desactivar en Supabase → Table Editor → `tecnicos` (columna
  `activo`). No confundir con la cuenta de acceso de técnicos, que es una
  sola clave compartida — ver siguiente punto.
- **Cambiar una clave** (oficina o técnicos): Supabase → Authentication →
  Users → seleccionar la cuenta → reset password.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Documentar puesta en marcha y actualización a dos roles de acceso"
```

---

### Task 7: Verificación local y regresión general

**Files:**
- Modify: solo lo que la verificación exija corregir

- [ ] **Step 1: Pruebas unitarias completas**

Run: `npm test`
Expected: PASS — 19 en verde.

- [ ] **Step 2: Regresión en modo demo, escritorio y 375px**

Con `python3 -m http.server 8123`, clave `demo`: flujo completo — lista,
buscador, crear orden con servicios, completar con firmas, PDF con marca de
agua, botón "+ Nueva orden" visible en todo momento (modo demo siempre es
`'oficina'`), sin desbordes horizontales en 375px, consola limpia.

- [ ] **Step 3: Confirmar que el modo offline sigue intacto**

Con sesión real de Supabase si hay una activa en el navegador de pruebas (si
no la hay, se salta este paso y se cubre en la Tarea 8 con las cuentas ya
creadas): repetir el simulacro corto de la Tarea 7 del plan anterior
(`docs/superpowers/plans/2026-07-15-marca-agua-buscador-offline.md`) —
cortar la red vía `javascript_tool`, abrir una orden pendiente, completarla
con firmas, confirmar que queda "por enviar" y se sincroniza sola al
restaurar la red. El objetivo es confirmar que el cambio de `completarOrden`
a `.rpc()` no rompió nada de ese flujo.

- [ ] **Step 4: Commit de correcciones (solo si hubo)**

```bash
git add -A
git commit -m "Correcciones tras verificación local de los dos roles de acceso"
```

---

### Task 8: Puesta en marcha en producción y verificación en vivo

**Esta tarea la ejecuta el controlador directamente (no un subagente nuevo)**,
porque requiere coordinarse con Andre en tiempo real: hay pasos que solo él
puede hacer (crear la cuenta, correr SQL en su proyecto de Supabase), y el
controlador no tiene ni debe tener las credenciales para hacerlos en su
lugar.

- [ ] **Step 1: Entregar a Andre los pasos exactos**

Mensaje a enviar (contenido, no un paso de código):

1. Entrar a su proyecto de Supabase → SQL Editor → New query.
2. Pegar y correr el **Paso 1** de `supabase/migracion-roles.sql` (créalo en
   la Tarea 1; contenido ya en el repo).
3. Ir a Authentication → Users → *Add user*, crear
   `tecnicos@hogaresinteligentes.app` con una clave nueva (distinta a la de
   oficina), marcando *Auto confirm user*.
4. Volver a SQL Editor y correr el **Paso 2** del mismo archivo.
5. Avisar al controlador cuando esté listo.

- [ ] **Step 2: Esperar confirmación de Andre**

No continuar a los siguientes pasos hasta que Andre confirme que ya corrió
los dos pasos del SQL y creó la cuenta.

- [ ] **Step 3: Fusionar y desplegar el código**

Usar el skill `superpowers:finishing-a-development-branch` para decidir cómo
cerrar la rama `desarrollo` (probablemente fusionar a `main` localmente,
igual que en los cambios anteriores) y, si Andre lo confirma, hacer
`git push origin main` para que GitHub Pages lo publique.

- [ ] **Step 4: Verificación en vivo en producción**

Con el navegador de pruebas, contra `https://devracf.github.io/orden-servicio-hogares/`:

1. Entrar con la clave de oficina: debe verse "+ Nueva orden", poder crear
   una orden, editar (si aplica), y completar cualquier orden pendiente.
2. Cerrar sesión, entrar con la clave de técnicos: NO debe verse "+ Nueva
   orden"; navegar a mano a `#/nueva` debe regresar a la lista sin mostrar el
   formulario; debe poder abrir una orden pendiente, llenarla con firmas
   (`PointerEvent` sintéticos como en verificaciones anteriores) y
   completarla; debe poder descargar/compartir su PDF.
3. Con la sesión de técnico todavía activa en esa misma pestaña, confirmar
   que el bloqueo es real y no solo de la interfaz: la app ya tiene un
   cliente de Supabase vivo en memoria (usado por `js/datos-supabase.js`),
   así que basta con crear uno nuevo igual de la consola, con las mismas
   credenciales públicas, y usar la sesión ya activa del navegador. Ejecutar
   vía `javascript_tool` (reemplazando `<ID_DE_UNA_ORDEN_EXISTENTE>` por el
   `id` de cualquier orden completada, visible en la URL al abrirla):

   ```js
   (async () => {
     const cfg = await import('./js/config.js');
     const cliente = window.supabase.createClient(cfg.CONFIG.SUPABASE_URL, cfg.CONFIG.SUPABASE_ANON_KEY);
     // Esta pestaña ya tiene la sesión de técnico guardada por Supabase Auth
     // en localStorage; el cliente nuevo la recoge sola al usarla.
     const { data, error } = await cliente
       .from('ordenes')
       .update({ cliente_nombre: 'INTENTO DE BYPASS' })
       .eq('id', '<ID_DE_UNA_ORDEN_EXISTENTE>')
       .select();
     return { data, error: error?.message, filasAfectadas: data?.length ?? 0 };
   })();
   ```

   Esperado: `filasAfectadas: 0` (RLS bloquea la fila, no hay error explícito
   porque desde el punto de vista de Postgres simplemente no hay filas que
   cumplan la política — así es como se comporta un `update` bloqueado por
   RLS en Supabase). Confirmar además, entrando a Supabase → Database →
   Policies → tabla `ordenes`, que la política "actualizar ordenes solo
   oficina" existe y que no queda ninguna política vieja "actualizar ordenes
   autenticado".
4. Consola sin errores inesperados en ninguno de los dos flujos (aparte del
   intento de bypass del punto 3, que es intencional).

- [ ] **Step 5: Reportar a Andre**

Confirmar en el chat que ambas cuentas funcionan como se diseñó, y que ya
está en producción.
