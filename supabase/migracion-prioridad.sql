-- Migración: prioridad manual de las órdenes pendientes
-- Correr en: Supabase → SQL Editor → New query → Run
--
-- Agrega la columna "prioridad" (un número aparte del folio, que oficina
-- asigna a mano para indicar en qué orden se van a trabajar las pendientes).
-- No toca ninguna función ni política — la de "actualizar ordenes solo
-- oficina" ya cubre esta columna igual que cualquier otra.

alter table ordenes add column if not exists prioridad integer;
