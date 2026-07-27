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

## Administración

- **Técnicos** (nombres que aparecen en el dropdown de una orden):
  agregar/desactivar en Supabase → Table Editor → `tecnicos` (columna
  `activo`). No confundir con la cuenta de acceso de técnicos, que es una
  sola clave compartida — ver siguiente punto.
- **Cambiar una clave** (oficina o técnicos): Supabase → Authentication →
  Users → seleccionar la cuenta → reset password.

## Pruebas

    npm test
