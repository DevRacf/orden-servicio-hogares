-- Migración: permitir borrar órdenes completadas (solo oficina)
-- Correr en: Supabase → SQL Editor → New query → Run
--
-- Hasta ahora no había ninguna política de DELETE, así que nadie podía
-- borrar órdenes desde la app (RLS lo bloqueaba por default). Esto agrega
-- el permiso, limitado a órdenes ya completadas y solo para la cuenta de
-- oficina — la misma regla se aplica también del lado del cliente en la app.

drop policy if exists "borrar ordenes completadas solo oficina" on ordenes;

create policy "borrar ordenes completadas solo oficina" on ordenes
  for delete to authenticated using (
    estado = 'completada'
    and exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  );
