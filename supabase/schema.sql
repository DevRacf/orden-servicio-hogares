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
  firma_tecnico text,
  firma_cliente text,
  completed_at timestamptz
);

alter table tecnicos enable row level security;
alter table ordenes enable row level security;

create policy "leer tecnicos autenticado" on tecnicos
  for select to authenticated using (true);

create policy "leer ordenes autenticado" on ordenes
  for select to authenticated using (true);

create policy "crear ordenes autenticado" on ordenes
  for insert to authenticated with check (true);

create policy "actualizar ordenes autenticado" on ordenes
  for update to authenticated using (true);

-- Técnicos iniciales: edita los nombres reales aquí o después en Table Editor
insert into tecnicos (nombre) values ('Técnico 1'), ('Técnico 2');
