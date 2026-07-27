-- Migración: dos niveles de acceso (oficina y técnicos)
-- Seguro de correr sobre la base ya en producción: no borra ni modifica
-- órdenes ni técnicos existentes.
--
-- PASO 1 — correr esto primero, en: Supabase → SQL Editor → New query → Run

create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('oficina', 'tecnico'))
);

alter table perfiles enable row level security;

drop policy if exists "leer mi propio perfil" on perfiles;
create policy "leer mi propio perfil" on perfiles
  for select to authenticated using (auth.uid() = id);

-- Da de alta el perfil de oficina automáticamente (la cuenta ya existe desde
-- la puesta en marcha original) — no hace falta copiar ningún ID a mano.
insert into perfiles (id, rol)
select id, 'oficina' from auth.users where email = 'ordenes@hogaresinteligentes.app'
on conflict (id) do nothing;

drop policy if exists "crear ordenes autenticado" on ordenes;
drop policy if exists "actualizar ordenes autenticado" on ordenes;

create policy "crear ordenes solo oficina" on ordenes
  for insert to authenticated with check (
    exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  );

create policy "actualizar ordenes solo oficina" on ordenes
  for update to authenticated using (
    exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  );

create or replace function completar_orden(
  p_id uuid,
  p_trabajo_realizado text,
  p_materiales jsonb,
  p_firma_tecnico text,
  p_firma_cliente text,
  p_completed_at timestamptz
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

revoke execute on function completar_orden(uuid, text, jsonb, text, text, timestamptz) from public;
grant execute on function completar_orden(uuid, text, jsonb, text, text, timestamptz) to authenticated;

-- PASO 2 — correr esto DESPUÉS de crear la cuenta de técnicos en
-- Authentication → Users (ver README). Antes de eso fallará porque la cuenta
-- todavía no existe.

insert into perfiles (id, rol)
select id, 'tecnico' from auth.users where email = 'tecnicos@hogaresinteligentes.app'
on conflict (id) do nothing;
