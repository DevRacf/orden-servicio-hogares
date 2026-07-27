# Dos niveles de acceso: oficina y técnicos

**Fecha:** 2026-07-27
**Estado:** Aprobado por Andre.

## Qué es

Hoy toda la app usa una sola cuenta compartida de Supabase Auth — cualquiera
con la clave puede crear órdenes, editarlas y completarlas. Se agrega un
segundo nivel de acceso para los técnicos, que solo pueden completar órdenes
ya creadas por la oficina, sin poder crear órdenes nuevas ni tocar los datos
del cliente/servicios/técnico asignado. El bloqueo se aplica en el propio
Supabase (no solo ocultando botones en la pantalla), para que sea real aunque
alguien intentara saltarse la app.

## Decisiones tomadas con el usuario

- **Cuentas de técnico**: una sola clave compartida entre todos los técnicos
  (igual que la de oficina hoy) — no una cuenta individual por técnico. Cada
  quien sigue eligiendo su propio nombre en el dropdown "Técnico asignado" al
  completar una orden, como ya funciona.
- **Nivel de bloqueo**: aplicado también del lado del servidor (Supabase), no
  solo ocultando la interfaz. Se descartó el bloqueo "solo en la app" por ser
  cosmético — cualquiera que supiera hablarle directo a la API de Supabase
  podría editar igual.
- **Alcance de los permisos de técnico**: pueden ver todas las órdenes
  (pendientes y completadas, de cualquier cliente — igual que hoy), completar
  órdenes pendientes (trabajo realizado, materiales, ambas firmas), y
  descargar/compartir el PDF. No pueden crear órdenes ni editar cliente,
  teléfono, dirección, tipo de cliente, servicios o técnico asignado de una
  orden existente.
- **Pantalla de entrada**: sigue habiendo un solo campo de clave, sin selector
  de rol. La app prueba la clave contra la cuenta de oficina primero y, si no
  coincide, contra la cuenta de técnicos. Se descartó agregar un selector
  "Oficina / Técnicos" antes del campo de clave por ser un paso extra
  innecesario dado que las claves ya son distintas por sí solas.

## Modelo de datos

Tabla nueva `perfiles`, que asocia cada cuenta de Supabase Auth con un rol:

```sql
create table perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('oficina', 'tecnico'))
);
```

Se inserta una fila por cada una de las dos cuentas (la de oficina que ya
existe, y la nueva de técnicos que Andre crea como parte de este trabajo).

## Permisos: RLS y función de cierre

Las políticas de Row Level Security de `ordenes` cambian así:

- **Lectura** (`select`): sin cambio — cualquier cuenta autenticada (oficina o
  técnico) puede leer todas las órdenes.
- **Creación** (`insert`) y **edición directa de la fila** (`update`): solo la
  cuenta con `rol = 'oficina'` en `perfiles`. La cuenta de técnico ya no puede
  hacer un `update` directo sobre `ordenes` en absoluto.
- **Cierre de una orden**: en vez de que el cliente arme un `update` con
  cualquier columna, se agrega una función de Postgres
  `completar_orden(p_id, p_trabajo_realizado, p_materiales, p_firma_tecnico,
  p_firma_cliente, p_completed_at)` marcada `security definer`. La función:
  1. Verifica que quien llama esté autenticado (oficina o técnico — ambos
     pueden cerrar órdenes).
  2. Verifica que la orden exista y esté en estado `pendiente` (si no, error).
  3. Actualiza únicamente `trabajo_realizado`, `materiales`, `firma_tecnico`,
     `firma_cliente`, `estado` (a `completada`) y `completed_at` — ninguna
     otra columna es alcanzable desde esta función, sin importar qué se le
     mande.
  4. Devuelve la fila actualizada.

  Esta función es la única puerta para cerrar una orden — la usan tanto
  oficina como técnicos (no hay dos caminos distintos para la misma acción).
  Es la pieza que hace el bloqueo real: aunque alguien arme una petición HTTP
  a mano contra la API de Supabase, no hay forma de que una cuenta de técnico
  toque `cliente_nombre` u otra columna fuera de esa lista.

- **Tabla `tecnicos`** (nombres para el dropdown): sin cambio, lectura para
  cualquier autenticado.

## Inicio de sesión y detección de rol

`iniciarSesion(clave)` en `js/datos-supabase.js` cambia de intentar un solo
correo a intentar dos, en orden:

1. Intenta `signInWithPassword` con el correo de oficina y la clave dada.
2. Si falla por credenciales inválidas, intenta con el correo de técnicos y
   la misma clave.
3. Si ambos fallan, error "Clave incorrecta" (igual mensaje que hoy — no se
   revela cuál de las dos cuentas existe).

Al iniciar sesión con éxito, se guarda en memoria (variable de módulo, no
localStorage) el `rol` obtenido de `perfiles` para esa cuenta, vía una
consulta `select rol from perfiles where id = auth.uid()`. Este rol se vuelve
a consultar cada vez que se restaura una sesión existente al recargar la
página (`haySesion` ya se llama al arrancar; se aprovecha ese mismo punto).

No se persiste el rol en `localStorage`/caché offline: si un técnico abre la
app sin conexión y sin sesión restaurada por el navegador, ve la pantalla de
login normal (igual que hoy, el login siempre requiere internet). Si ya tenía
sesión activa guardada por el navegador, Supabase la restaura del lado del
cliente sin necesitar red para esa parte, y el rol se puede quedar en el
último valor conocido de memoria durante esa sesión de pestaña — no hace
falta persistirlo porque no sobrevive a cerrar la pestaña de todos modos (se
vuelve a pedir sesión/rol en cada carga de página).

## Cambios en la interfaz

- `js/app.js` guarda el rol actual junto a las demás variables de sesión.
- El enlace "+ Nueva orden" y el acceso a `#/nueva` se ocultan/bloquean cuando
  `rol === 'tecnico'`: si alguien llega a esa ruta a mano (escribiendo el
  hash), la app redirige a la lista sin mostrar el formulario. Esto es una
  segunda capa de conveniencia — la protección real ya la da Supabase, pero
  evita que un técnico llegue a un formulario que de todas formas fallaría al
  guardar.
- El resto de la pantalla (lista, detalle de orden, formulario de cierre con
  firmas, botón de PDF) es idéntico para ambos roles — no hay nada que
  técnicos vean distinto ahí.

## Cambios en la capa de datos

- `js/datos-supabase.js`:
  - `iniciarSesion` prueba los dos correos como se describió arriba.
  - Nueva función `obtenerRol()` — consulta `perfiles` para la sesión activa.
  - `completarOrden` deja de hacer `.from('ordenes').update(...)` y pasa a
    `.rpc('completar_orden', { p_id, p_trabajo_realizado, p_materiales,
    p_firma_tecnico, p_firma_cliente, p_completed_at })`.
- `js/offline.js`: la capa offline llama a `sb.completarOrden` igual que hoy
  (sin cambios en su lógica de cola/caché) — el cambio de `update` a `rpc`
  queda contenido en `datos-supabase.js`, así que el modo sin internet sigue
  funcionando igual para ambos roles sin tocar nada de la Tarea 7 anterior.
- `js/config.js`: se agrega `LOGIN_EMAIL_TECNICOS` junto al `LOGIN_EMAIL` ya
  existente (renombrado en los comentarios a "cuenta de oficina" para
  claridad).

## Manejo de errores

- Si la función `completar_orden` rechaza la llamada (orden ya completada por
  alguien más, orden inexistente), el error sube igual que hoy a través de
  `datos.completarOrden` y se muestra el mensaje genérico "No se pudo guardar"
  que ya existe en `js/app.js` — no se necesita un mensaje nuevo.
- Si `obtenerRol()` no encuentra fila en `perfiles` para la cuenta activa
  (caso que no debería pasar si Andre sigue los pasos de puesta en marcha),
  se trata como `rol = 'tecnico'` por seguridad (el lado restrictivo, nunca al
  revés) y se registra un `console.error` para que sea visible al depurar.

## Pruebas

- No hay lógica pura nueva que amerite TDD (la función `completar_orden` vive
  en Postgres, no en JS; las pruebas de esa función son manuales vía SQL
  Editor o probando el flujo completo en la app).
- Se agrega una prueba a `tests/ordenes.test.js` o archivo nuevo si aplica
  solo si aparece alguna función pura nueva durante la implementación (por
  ejemplo, si se extrae alguna lógica de decisión de UI); no se anticipa
  ninguna en este diseño.
- Verificación manual obligatoria antes de cerrar la tarea: entrar con la
  clave de oficina (debe poder todo, sin cambios); entrar con la clave de
  técnico (debe ver la lista completa, no ver "+ Nueva orden", poder
  completar una orden pendiente con firmas y descargar su PDF, y — probado a
  propósito — que un intento de `insert` o `update` directo contra `ordenes`
  vía la consola del navegador con la sesión de técnico sea rechazado por
  Supabase).

## Puesta en marcha (lo que hace Andre)

1. Correr el script SQL de este cambio (se entrega en la implementación) en
   Supabase → SQL Editor.
2. Crear la segunda cuenta en Supabase → Authentication → Users → *Add user*
   (correo `tecnicos@hogaresinteligentes.app` o el que Andre prefiera, con
   *Auto confirm user* marcado), igual que hizo con la cuenta de oficina.
3. Insertar las dos filas en `perfiles` (una por cuenta) — se entrega el SQL
   exacto, Andre solo necesita copiar el ID de cada usuario desde
   Authentication → Users.
4. Compartir la nueva clave con los técnicos.

El README del proyecto se actualiza con estos pasos como parte de la
implementación, igual que documenta hoy la puesta en marcha de la cuenta de
oficina.
