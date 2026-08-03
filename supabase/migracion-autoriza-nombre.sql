-- Firma del cliente opcional: si el cliente no puede firmar en pantalla,
-- se puede anotar el nombre de quien recibe/autoriza en su lugar. Correr
-- una sola vez en: Supabase → SQL Editor → New query → Run

alter table ordenes add column if not exists autoriza_nombre text;

drop function if exists completar_orden(uuid, text, jsonb, text, text, timestamptz, jsonb);

create or replace function completar_orden(
  p_id uuid,
  p_trabajo_realizado text,
  p_materiales jsonb,
  p_firma_tecnico text,
  p_firma_cliente text,
  p_completed_at timestamptz,
  p_materiales_cliente jsonb default '[]'::jsonb,
  p_autoriza_nombre text default null
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
    autoriza_nombre = p_autoriza_nombre,
    estado = 'completada',
    estatus_cobro = null,
    completed_at = coalesce(p_completed_at, now())
  where id = p_id and estado = 'pendiente'
  returning * into resultado;

  if resultado is null then
    raise exception 'Orden no encontrada o ya completada';
  end if;

  return resultado;
end;
$$;

revoke execute on function completar_orden(uuid, text, jsonb, text, text, timestamptz, jsonb, text) from public;
grant execute on function completar_orden(uuid, text, jsonb, text, text, timestamptz, jsonb, text) to authenticated;
