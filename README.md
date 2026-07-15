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
