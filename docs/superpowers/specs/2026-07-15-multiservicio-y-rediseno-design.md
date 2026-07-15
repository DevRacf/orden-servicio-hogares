# Múltiples servicios por orden + rediseño visual "Técnico en Campo"

**Fecha:** 2026-07-15
**Estado:** Aprobado por Andre.

## Qué es

Dos cambios sobre la app de orden de servicio digital ya construida (ver spec original
`docs/superpowers/specs/2026-07-14-orden-servicio-digital-design.md`):

1. Una orden puede pedir **varios servicios a la vez** (hoy solo admite uno).
2. Rediseño visual de las 4 pantallas con una dirección más robusta, pensada para uso
   táctil bajo sol directo.

No hay datos reales en producción todavía (la app sigue en modo demo; Andre no ha hecho
el paso a Supabase del README). Por eso el cambio de modelo de datos se hace directo,
sin lógica de migración ni compatibilidad con el campo viejo.

## Decisiones tomadas con el usuario

- **Selección de servicios**: casillas/chips con las 6 opciones fijas existentes
  (Cámaras, Audio, Internet, Pantallas, Mantenimiento, Otro); la oficina marca todas
  las que apliquen. Se descartó el patrón de lista dinámica (como materiales) por ser
  más pasos para un conjunto de opciones fijo y pequeño, y el de "uno principal + notas
  libres" por perder estructura filtrable.
- **Migración**: no aplica — se reemplaza `tipo_servicio` (un valor) por `servicios`
  (arreglo) directo en toda la app y en el esquema de Supabase (aún no desplegado).
- **Dirección visual**: Opción B "Técnico en Campo", elegida sobre una alternativa más
  sobria tipo SaaS corporativo, por verse más robusta y de mayor contraste para
  exteriores.

## Cambio 1: múltiples servicios

### Modelo de datos

- `ordenes.tipo_servicio` (texto, un valor) → `ordenes.servicios` (arreglo de texto).
  - Demo (localStorage): se guarda como array JS normal dentro del objeto orden.
  - Supabase: columna `text[]` con `check` de que cada elemento pertenezca al enum
    existente (`camaras`, `audio`, `internet`, `pantallas`, `mantenimiento`, `otro`) y
    que el arreglo no esté vacío.
- `TIPOS_SERVICIO` (mapa valor→etiqueta en `js/ordenes.js`) no cambia — se sigue usando
  para traducir cada elemento del arreglo a su etiqueta legible.

### Formulario "Nueva orden"

- El `<select name="tipo_servicio">` se reemplaza por 6 casillas (`<input
  type="checkbox">` + etiqueta) agrupadas bajo "Servicios solicitados", una por cada
  clave de `TIPOS_SERVICIO`, en el mismo orden en que aparecen hoy en el select.
- Validación (`validarNuevaOrden` en `js/ordenes.js`): exige al menos un servicio
  marcado; si no hay ninguno, error "Selecciona al menos un servicio". Las demás
  validaciones (nombre, dirección, tipo de cliente, técnico) no cambian.

### Visualización

- **Tarjeta de la lista** (`tarjetaOrden`): la línea de servicio pasa de un solo texto
  a una fila de etiquetas cortas, una por servicio (ej. "Cámaras · Internet").
- **Detalle de orden** (`renderOrden`): el renglón "Servicio" se convierte en
  "Servicios" y muestra las etiquetas separadas por coma.
- **PDF** (`seccionesPdf`/`generarPdf`): el renglón "Servicio" pasa a "Servicios" con
  las etiquetas unidas por coma; si la línea es muy larga para una columna, se envuelve
  igual que los bloques de texto existentes (reutiliza el mismo mecanismo de paginado
  ya implementado en la Tarea 7 original).

### Fuera de alcance

- No se agrega un "servicio principal" ni orden de prioridad entre los servicios
  marcados — todos tienen el mismo peso.
- No se permite escribir un servicio libre fuera de las 6 opciones (sigue siendo un
  catálogo fijo, igual que hoy).

## Cambio 2: rediseño visual "Técnico en Campo"

Aplica a las 4 pantallas existentes (entrar, lista, nueva orden, detalle/completar) sin
cambiar su estructura, routing, ni comportamiento — solo la piel visual (`css/styles.css`
y ajustes menores de marcado donde el nuevo estilo lo requiera, como los chips de
servicios).

### Tokens de color (reemplazan los actuales en `:root`)

| Token | Valor | Uso |
|---|---|---|
| `--azul` (primario) | `#0B2545` | Encabezado, texto de marca, botones secundarios de contorno |
| `--acento` | `#D97706` | Botones primarios, casillas/chips marcados, enlaces de acción |
| `--fondo` | `#F4F6F5` | Fondo general |
| `--texto` | `#0B2545` | Texto principal (mismo tono que el primario, alto contraste) |
| `--gris` (texto secundario) | `#5c6b78` | Se mantiene sin cambio — ya pasa AA |
| `--rojo` (error) | `#c0392b` | Se mantiene sin cambio |
| `--pendiente-fondo` / `--pendiente-texto` | `#FEF3C7` / `#92400E` | Badge de estado "pendiente" — independiente del acento ámbar para no confundir "seleccionado" con "estado" |
| `--completada-fondo` / `--completada-texto` | `#D7F5E3` / `#14683C` | Badge de estado "completada" — sin cambio del valor actual |

### Tipografía

- Encabezados (marca, `h1`–`h3`, botones, badges): **Manrope**, pesos 700/800.
- Cuerpo, formularios, texto de tarjetas: **Inter**, pesos 400/500/600.
- Se cargan desde Google Fonts vía `<link>` en `index.html` (mismo patrón que las
  librerías CDN ya usadas para Supabase/signature_pad/jsPDF).
- Tamaño base sube ligeramente respecto al diseño actual (inputs/botones más grandes)
  para mejor uso táctil y legibilidad al sol — mínimo 16px en cuerpo, sin cambiar la
  jerarquía de tamaños ya definida.

### Componentes

- **Bordes**: 2px sólidos (antes 1px) en tarjetas, inputs, chips y botones de contorno;
  sin sombras (`box-shadow`) en ningún elemento — el peso visual viene del borde y el
  color, no de elevación.
- **Esquinas**: se mantienen redondeadas, con radios ligeramente mayores a los actuales
  para casar con el look más robusto.
- **Botones primarios**: fondo ámbar, texto azul marino oscuro (no blanco — mejor
  contraste sobre ámbar), altura mínima 48px.
- **Chips de servicio** (nuevo componente, formulario de nueva orden): casilla +
  etiqueta dentro de un contorno de 2px; sin marcar = fondo blanco/texto azul marino;
  marcado = fondo ámbar/texto azul marino oscuro, con un ✓ visible (no solo color, para
  accesibilidad).
- **Firma y materiales**: sin cambio funcional; los canvas de firma y las filas de
  materiales adoptan los mismos bordes de 2px y tipografía Inter para verse consistentes
  con el resto.
- **Botón "Salir"**, enlaces "Limpiar firma" / "+ Agregar material" / "← Órdenes":
  pasan a color ámbar sobre fondo azul marino (encabezado) o azul marino sobre fondo
  claro (resto de la app), manteniendo el mismo contraste AA ya validado en la Tarea 1
  original.

### Accesibilidad

- Todos los pares texto/fondo nuevos deben cumplir 4.5:1 (texto normal) según las
  mismas reglas ya aplicadas en la Tarea 1 original (contraste, tamaño de toque ≥44px,
  jerarquía de encabezados). El estado "marcado" de los chips no depende solo del color
  (incluye el ✓).

## Testing

- `validarNuevaOrden` gana un caso de prueba: arreglo `servicios` vacío → error; con al
  menos uno → válido. Las pruebas existentes que usan `tipo_servicio` se actualizan a
  `servicios: ['camaras']` (o el arreglo correspondiente) para seguir siendo válidas.
- `seccionesPdf` gana un caso de prueba: orden con varios servicios → la etiqueta
  "Servicios" contiene todas las etiquetas separadas por coma.
- Verificación en navegador (igual que las tareas originales): crear una orden con 3
  servicios marcados, confirmar que aparecen en la tarjeta, en el detalle y en el PDF
  generado; confirmar que no se puede crear una orden sin ningún servicio marcado.
- Revisar visualmente en 375px y escritorio que el nuevo estilo no rompe nada (mismo
  checklist de la Tarea 8 original: sin desbordes horizontales, botones cómodos al
  tacto, consola sin errores).

## Fuera de alcance (de ambos cambios)

- No se toca el flujo de login, la capa de datos (salvo el campo `servicios`), ni la
  lógica de firmas/PDF/materiales más allá de mostrar la lista de servicios.
- No se agrega modo oscuro.
- No se rediseña el README ni la guía de puesta en marcha de Supabase (solo se actualiza
  el `schema.sql` para reflejar la columna `servicios`).
