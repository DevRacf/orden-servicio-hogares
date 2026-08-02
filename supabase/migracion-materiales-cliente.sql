-- Migración: subsección "Materiales y equipo del cliente"
-- Correr en: Supabase → SQL Editor → New query → Run
--
-- Agrega una columna aparte para el equipo que el cliente ya tenía (comprado
-- por su cuenta o reubicado desde otro sitio), sin tocar las órdenes ya
-- guardadas. El nuevo parámetro de completar_orden tiene valor por default,
-- así que sigue funcionando aunque por un momento la app vieja (sin este
-- cambio) todavía esté llamando la función sin mandarlo.

alter table ordenes add column if not exists materiales_cliente jsonb not null default '[]'::jsonb;

drop function if exists completar_orden(uuid, text, jsonb, text, text, timestamptz);

create or replace function completar_orden(
  p_id uuid,
  p_trabajo_realizado text,
  p_materiales jsonb,
  p_firma_tecnico text,
  p_firma_cliente text,
  p_completed_at timestamptz,
  p_materiales_cliente jsonb default '[]'::jsonb
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
    materiales_cliente = p_materiales_cliente,
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

revoke execute on function completar_orden(uuid, text, jsonb, text, text, timestamptz, jsonb) from public;
grant execute on function completar_orden(uuid, text, jsonb, text, text, timestamptz, jsonb) to authenticated;
