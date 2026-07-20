# Marca de agua en PDF + buscador + modo sin internet

**Fecha:** 2026-07-15
**Estado:** Aprobado por Andre.

## Qué es

Tres mejoras sobre la app en producción (GitHub Pages + Supabase, ver specs
anteriores en esta carpeta):

1. El logo de Hogares Inteligentes como marca de agua en el PDF de la orden.
2. Un buscador por cliente/folio en la lista de órdenes.
3. Modo sin internet para técnicos en campo: completar órdenes sin señal y
   sincronizar automáticamente al reconectar.

## Decisiones tomadas con el usuario

- **Alcance offline**: solo *completar* órdenes funciona sin señal. Crear órdenes
  nuevas e iniciar sesión siguen requiriendo internet (las hace la oficina o el
  técnico en la mañana, con señal). Se descartó el alcance "todo offline desde el
  primer arranque" por complejidad innecesaria.
- **Mecanismo offline**: service worker (la app se guarda en el teléfono tras la
  primera visita) + cola local de cierres pendientes. Se descartó "solo cola sin
  service worker" (frágil: los celulares cierran pestañas en segundo plano) y
  "PWA completa con background sync" (no funciona en iPhone; se puede evolucionar
  después).
- **Conflictos**: si dos personas completan la misma orden, gana la última en
  llegar (last-write-wins). Caso rarísimo: no hay función de editar órdenes, solo
  crear y completar.
- **Logo**: Andre entrega el archivo PNG (pendiente de ubicar en su Mac al
  momento de escribir esto; requisito para implementar la marca de agua).

## Mejora 1: marca de agua en el PDF

- El PNG del logo se convierte a data-URL base64 y se guarda como constante
  exportada en un archivo nuevo `js/logo.js`. Así queda dentro de la app (sin
  peticiones de red, funciona offline, sin problemas de CORS).
- En `generarPdf` (`js/pdf.js`): en cada página del documento (incluidas las
  páginas extra que crea la paginación existente) se dibuja el logo centrado,
  de 120mm de ancho (alto proporcional según la relación de aspecto del PNG),
  con opacidad 0.1 usando el GState de jsPDF (`saveGraphicsState` /
  `setGState(new GState({opacity: 0.1}))` / `restoreGraphicsState`). Si al
  verlo el resultado se percibe muy fuerte o muy débil, el único ajuste
  permitido sin volver a consultar es mover la opacidad dentro de 0.06–0.15.
- Se dibuja **antes** del contenido de la página, para que texto, líneas y firmas
  queden encima y se lean sin obstáculo.
- El peso del PDF debe seguir siendo razonable (decenas de KB, no MB) — el logo
  base64 se incluye una sola vez por documento gracias a la compresión ya
  activada (`compress: true`); verificar el tamaño resultante en la
  implementación.

## Mejora 2: buscador en la lista

- Un `<input type="search">` arriba de la lista (debajo de "+ Nueva orden"),
  placeholder "Buscar por cliente o folio".
- Filtra en vivo (evento `input`) las dos secciones, Pendientes y Completadas.
- Lógica pura en `js/ordenes.js`: `filtrarOrdenes(ordenes, texto)` — regresa las
  órdenes cuyo `cliente_nombre` o `folio` contengan el texto, ignorando
  mayúsculas y acentos (normalización NFD + remoción de diacríticos). Texto
  vacío regresa todo. Con pruebas en `tests/ordenes.test.js`.
- El texto buscado se limpia cada vez que se vuelve a renderizar la lista
  (comportamiento más simple y predecible; no se persiste entre vistas).
- Si el filtro deja una sección vacía, se muestra el estado vacío existente
  ("Sin órdenes...").

## Mejora 3: modo sin internet

### Service worker (`sw.js` en la raíz del repo)

- **Precarga** al instalarse: archivos locales de la app (`index.html`,
  `css/styles.css`, todos los `js/*.js`) y las 3 librerías CDN (supabase-js,
  signature_pad, jsPDF).
- **Estrategia para archivos locales**: red primero, caché como respaldo. Con
  internet siempre se sirve la versión más reciente (los deploys nuevos llegan
  solos, sin disciplina de versionado); sin internet se sirve la copia guardada.
- **Estrategia para CDN y Google Fonts**: caché primero (las URLs de CDN están
  versionadas; las fuentes se cachean en tiempo de ejecución al primer uso).
- **Nunca intercepta** las peticiones a `*.supabase.co` — esas van siempre a la
  red y su fallo es lo que dispara el modo offline de la capa de datos.
- Se registra desde `js/app.js` con ruta relativa (`sw.js`), compatible con el
  scope de GitHub Pages (`/orden-servicio-hogares/`).

### Capa de datos offline (`js/offline.js`)

Envuelve la implementación de Supabase. `js/datos.js` pasa de elegir
`demo | supabase` a elegir `demo | offline(supabase)` — el modo demo no cambia
(ya es local por naturaleza).

- **`listarOrdenes`**: con éxito de red, guarda copia en localStorage
  (`cache_ordenes`) y la regresa. Si la red falla, regresa la copia local
  (aplicando encima los cierres encolados, ver abajo). Si no hay copia ni red,
  deja subir el error (la pantalla de error existente ya lo maneja).
- **`obtenerOrden`**: mismo patrón, leyendo de la copia local al fallar la red.
- **`completarOrden`**: intenta la red; si falla por conexión, guarda el cierre
  en la cola local (`cola_cierres`: lista de `{ordenId, cierre, timestamp}`),
  actualiza la copia local de la orden (estado `completada` + bandera local
  `porEnviar: true`) y la regresa — el flujo de UI y el PDF funcionan igual que
  con red.
- **Sincronización**: al cargar la app, al evento `online` de la ventana, y
  antes de cada `listarOrdenes` con red: se envían los cierres encolados en
  orden; cada éxito sale de la cola y limpia la bandera local. Un fallo de red
  detiene el intento (se reintenta en la siguiente oportunidad); la cola nunca
  se descarta por errores.
- **`iniciarSesion`/`haySesion`/`cerrarSesion`/`listarTecnicos`/`crearOrden`**:
  pasan directo a la capa Supabase sin cambios. `haySesion` ya funciona offline
  (supabase-js guarda la sesión en localStorage). `crearOrden` sin red falla con
  el mensaje de conexión existente — correcto según el alcance elegido.

### Indicadores en la UI

- Letrero fijo bajo el encabezado cuando no hay conexión (evento
  `online`/`offline` + `navigator.onLine`): "Sin conexión — los cierres se
  guardarán y enviarán solos".
- Etiqueta "Por enviar" en la tarjeta de la lista y en el detalle de las órdenes
  con `porEnviar: true`. Desaparece al sincronizar.

### Casos borde

- Completar sin señal y reabrir la misma orden: se ve completada (desde la copia
  local) con su etiqueta "Por enviar"; el PDF se genera normal.
- El PDF se genera offline (jsPDF ya está cacheado); compartir por WhatsApp
  requiere señal, pero el archivo se puede guardar en el teléfono mientras.
- La sesión de Supabase expira tras días sin conexión: al reconectar, si el
  refresh del token falla, la sincronización espera a que el usuario vuelva a
  entrar con la clave (la cola no se pierde: persiste en localStorage).

## Fuera de alcance

- Crear órdenes sin internet (folio provisional, resolución de duplicados).
- Sincronización en segundo plano con la app cerrada (Background Sync).
- Instalación como PWA (manifest, ícono en pantalla de inicio) — evolución
  natural futura, no parte de esta versión.
- Logo en el encabezado de la app o del PDF (solo marca de agua por ahora).

## Verificación

- **Unitaria** (node:test): `filtrarOrdenes` (con/sin acentos, folio, vacío) y
  la lógica pura de la cola si se extrae como funciones puras (fusión de cierres
  encolados sobre la copia local).
- **Navegador**: flujo completo simulando el corte de red con un monkey-patch de
  `window.fetch` (rechazar peticiones a `supabase.co`) vía javascript_tool:
  cargar órdenes con red → cortar → navegar la lista y abrir órdenes (desde
  copia local) → completar una con firmas → ver "Por enviar" y letrero de sin
  conexión → generar PDF con marca de agua → restaurar red → confirmar que el
  cierre llegó a Supabase y la etiqueta desapareció.
- **Service worker**: verificar que registra y precachea (Application → Service
  Workers / caches vía javascript_tool), y que `index.html` sigue llegando
  fresco de la red cuando hay conexión.
- **PDF**: abrir el PDF generado y confirmar la marca de agua tenue centrada con
  el contenido legible encima; confirmar peso en decenas de KB.
