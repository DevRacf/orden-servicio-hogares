-- Esquema de la orden de servicio digital — Hogares Inteligentes
-- Correr completo en: Supabase → SQL Editor → New query → Run

create sequence if not exists folio_seq start 1;

create table if not exists tecnicos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true
);

create table if not exists ordenes (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('OS-' || lpad(nextval('folio_seq')::text, 4, '0')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'completada')),
  created_at timestamptz not null default now(),
  cliente_nombre text not null,
  cliente_telefono text,
  cliente_direccion text not null,
  tipo_cliente text not null check (tipo_cliente in ('hogar', 'empresa')),
  -- coalesce(...,0) es necesario porque array_length() regresa NULL (no 0)
  -- para un arreglo vacío, y un check que da NULL se considera válido en
  -- Postgres — sin el coalesce, un arreglo vacío pasaría el check.
  servicios text[] not null check (
    coalesce(array_length(servicios, 1), 0) > 0 and
    servicios <@ array['camaras','audio','internet','pantallas','mantenimiento','otro']::text[]
  ),
  descripcion text,
  tecnico text not null,
  trabajo_realizado text,
  materiales jsonb not null default '[]'::jsonb,
  -- Equipo que el cliente ya tenía (comprado por su cuenta o reubicado desde
  -- otro sitio) — se registra aparte de `materiales` porque no lo vendió ni
  -- lo puso la empresa.
  materiales_cliente jsonb not null default '[]'::jsonb,
  firma_tecnico text,
  firma_cliente text,
  completed_at timestamptz,
  -- Solo tiene sentido una vez completada la orden; null mientras está
  -- pendiente. Lo pone completar_orden() al cerrar y lo cambia oficina a
  -- mano desde el detalle de la orden.
  estatus_cobro text check (estatus_cobro in ('por_cobrar', 'cobrada', 'pagada'))
);

-- Un perfil por cada cuenta de Supabase Auth (oficina o técnicos), para saber
-- qué puede hacer cada una. Ver README para los pasos de puesta en marcha.
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('oficina', 'tecnico'))
);

alter table tecnicos enable row level security;
alter table ordenes enable row level security;
alter table perfiles enable row level security;

create policy "leer tecnicos autenticado" on tecnicos
  for select to authenticated using (true);

create policy "leer ordenes autenticado" on ordenes
  for select to authenticated using (true);

create policy "crear ordenes solo oficina" on ordenes
  for insert to authenticated with check (
    exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  );

create policy "actualizar ordenes solo oficina" on ordenes
  for update to authenticated using (
    exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  );

create policy "leer mi propio perfil" on perfiles
  for select to authenticated using (auth.uid() = id);

-- Única puerta para cerrar una orden (tanto oficina como técnicos la usan):
-- solo toca estas columnas, sin importar qué le manden — así se puede dar
-- acceso a técnicos sin que puedan tocar cliente, servicios, etc.
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

-- Técnicos iniciales: edita los nombres reales aquí o después en Table Editor
insert into tecnicos (nombre) values ('Técnico 1'), ('Técnico 2');
