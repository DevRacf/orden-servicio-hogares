# Orden de Servicio Digital — Hogares Inteligentes

**Fecha:** 2026-07-14
**Estado:** Aprobado por Andre (diseño verbal); pendiente revisión del documento escrito.

## Qué es

Web app para que Hogares Inteligentes (instalación de cámaras, audio, internet y
pantallas en hogares y empresas) maneje sus órdenes de servicio de forma digital:
la oficina crea y asigna la orden, el técnico la completa en sitio desde su
celular con la firma del cliente, y se genera un PDF listo para enviar por
WhatsApp.

## Decisiones tomadas con el usuario

- **Flujo completo oficina → técnico**: la oficina crea la orden y la asigna; el
  técnico la completa en sitio.
- **Resultado al cerrar**: PDF con folio, datos del servicio y firmas. No se
  pidieron notificaciones automáticas ni módulo de reportes.
- **Backend**: base de datos real en plan gratuito (Supabase), no Google Sheets
  ni sitio sin almacenamiento.
- **Contenido de la orden**: básicos (folio, fecha, cliente, tipo de servicio,
  descripción, firmas) más **materiales y equipos** (cantidad + descripción/
  modelo). Sin costos, sin fotos de evidencia, sin texto de garantía.
- **Acceso**: clave compartida simple; el técnico elige su nombre de una lista.
- **Enfoque técnico**: GitHub Pages (sitio estático) + Supabase gratuito.

## Arquitectura

- **Frontend**: HTML/CSS/JS estático, mobile-first, hospedado en GitHub Pages.
  Sin framework pesado; una sola app con vistas.
- **Backend**: Supabase plan gratuito — Postgres + Auth.
  - La "clave compartida" se implementa como una sola cuenta de Supabase Auth
    (correo genérico + contraseña = la clave). La pantalla de entrada solo pide
    la clave; el correo va fijo en el código. La sesión persiste por dispositivo.
  - Row Level Security: solo usuarios autenticados pueden leer/escribir.
- **PDF**: generado en el navegador con jsPDF. En celular, Web Share API para
  compartir directo por WhatsApp; en escritorio, descarga.
- **Firmas**: canvas táctil (signature_pad o equivalente), guardadas como imagen
  (data URL PNG) en la orden.

## Modelo de datos

Tabla `ordenes`:

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| folio | texto | Consecutivo `OS-0001`, generado por secuencia de Postgres — nunca se repite |
| estado | texto | `pendiente` \| `completada` |
| created_at | timestamptz | |
| cliente_nombre | texto | obligatorio |
| cliente_telefono | texto | |
| cliente_direccion | texto | obligatorio |
| tipo_cliente | texto | `hogar` \| `empresa` |
| tipo_servicio | texto | `camaras` \| `audio` \| `internet` \| `pantallas` \| `mantenimiento` \| `otro` |
| descripcion | texto | lo que solicita el cliente (lo llena la oficina) |
| tecnico | texto | nombre elegido de la lista |
| trabajo_realizado | texto | lo llena el técnico al cerrar |
| materiales | jsonb | lista `[{cantidad, descripcion}]` |
| firma_tecnico | texto | data URL PNG |
| firma_cliente | texto | data URL PNG; obligatoria para completar |
| completed_at | timestamptz | |

Tabla `tecnicos`: `id`, `nombre`, `activo`. Se administra desde el panel de
Supabase; la app solo lee los nombres activos. Sin pantalla de administración.

## Pantallas

1. **Entrar** — campo único de clave compartida. Sesión persistente.
2. **Lista de órdenes** — pendientes arriba, completadas abajo; cada tarjeta
   muestra folio, cliente, tipo de servicio y técnico. Botón "Nueva orden".
3. **Nueva orden** (oficina) — datos del cliente, tipo de servicio, descripción,
   técnico asignado. Al guardar se crea con folio y estado `pendiente`.
4. **Completar orden** (técnico) — muestra lo capturado por la oficina; el
   técnico llena trabajo realizado, materiales (filas dinámicas con botón
   "agregar"), firma del técnico y firma del cliente en canvas. Al guardar pasa
   a `completada` y se ofrece el PDF.
5. **Orden completada** — vista de solo lectura con botón para regenerar/
   compartir el PDF en cualquier momento.

## PDF

Encabezado con "Hogares Inteligentes" (logo si Andre lo comparte después),
folio, fecha de creación y de cierre, datos del cliente, tipo de servicio,
descripción solicitada, trabajo realizado, tabla de materiales/equipos, y las
dos firmas al pie con nombre del firmante.

## Errores y casos borde

- Firma del cliente obligatoria para completar; sin ella no se puede guardar.
- Folio asignado por la base de datos (secuencia) para evitar duplicados aunque
  dos personas creen órdenes al mismo tiempo.
- Sin conexión: la app muestra aviso claro; esta versión requiere internet para
  guardar (sin modo offline).
- Clave incorrecta: mensaje claro sin revelar el correo interno.

## Fuera de alcance (v1)

- Costos y totales, fotos de evidencia, texto de garantía.
- Notificaciones automáticas (correo/Telegram/WhatsApp).
- Cuentas individuales por usuario y permisos por rol.
- Modo offline.
- Pantalla para administrar técnicos (se hace en el panel de Supabase).

## Verificación

Antes de entregar: probar en navegador el flujo completo con datos ficticios —
entrar con la clave, crear orden, completarla con materiales y ambas firmas,
generar y abrir el PDF — en vista móvil (375px) y escritorio. Revisar consola
sin errores y que el folio incremente correctamente.
