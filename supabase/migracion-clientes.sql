-- Base de datos de clientes (autocompletar en "Nueva orden" y sección de
-- Clientes en el panel de oficina). Correr una sola vez en:
-- Supabase → SQL Editor → New query → Run

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  created_at timestamptz not null default now()
);

create table if not exists direcciones_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  direccion text not null,
  created_at timestamptz not null default now()
);

alter table clientes enable row level security;
alter table direcciones_cliente enable row level security;

create policy "clientes solo oficina" on clientes
  for all to authenticated using (
    exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  ) with check (
    exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  );

create policy "direcciones solo oficina" on direcciones_cliente
  for all to authenticated using (
    exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  ) with check (
    exists (select 1 from perfiles where id = auth.uid() and rol = 'oficina')
  );

-- Un cliente por cada nombre distinto ya visto en las órdenes (sin importar
-- mayúsculas ni espacios), con el primer teléfono que se le encuentre.
insert into clientes (nombre, telefono)
select distinct on (lower(trim(cliente_nombre)))
  trim(cliente_nombre), nullif(trim(cliente_telefono), '')
from ordenes
where trim(coalesce(cliente_nombre, '')) <> ''
order by lower(trim(cliente_nombre)), created_at asc;

-- Una fila por cada dirección distinta que ese cliente haya usado.
insert into direcciones_cliente (cliente_id, direccion)
select distinct c.id, trim(o.cliente_direccion)
from ordenes o
join clientes c on lower(trim(c.nombre)) = lower(trim(o.cliente_nombre))
where trim(coalesce(o.cliente_direccion, '')) <> '';
