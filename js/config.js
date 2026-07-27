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
