-- Migración: estatus de cobro (por cobrar / cobrada / pagada)
-- Correr en: Supabase → SQL Editor → New query → Run
--
-- Agrega la columna y hace que completar_orden() la inicialice en 'por_cobrar'
-- al cerrar una orden. Oficina la cambia después a mano desde el detalle de
-- la orden. No toca las órdenes pendientes ni cambia la firma de la función,
-- así que no hay ventana de rotura mientras GitHub Pages termina de desplegar.

alter table ordenes add column if not exists estatus_cobro text
  check (estatus_cobro in ('por_cobrar', 'cobrada', 'pagada'));

-- Completadas antes de este cambio: se asumen por cobrar.
update ordenes set estatus_cobro = 'por_cobrar'
where estado = 'completada' and estatus_cobro is null;

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
    estatus_cobro = 'por_cobrar',
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
