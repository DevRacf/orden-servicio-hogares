-- Migración: nombres reales de técnicos
-- Correr en: Supabase → SQL Editor → New query → Run
--
-- Renombra los técnicos placeholder ('Técnico 1', 'Técnico 2') por los
-- nombres reales, da de alta a Armando Ochoa como técnico nuevo, y
-- actualiza las órdenes pendientes que ya tenían asignado un placeholder.

update tecnicos set nombre = 'Alberto Zavala Orozco' where nombre = 'Técnico 1';
update tecnicos set nombre = 'Jorge Barbosa Soto' where nombre = 'Técnico 2';

insert into tecnicos (nombre)
select 'Armando Ochoa'
where not exists (select 1 from tecnicos where nombre = 'Armando Ochoa');

update ordenes set tecnico = 'Alberto Zavala Orozco'
where tecnico = 'Técnico 1' and estado = 'pendiente';

update ordenes set tecnico = 'Jorge Barbosa Soto'
where tecnico = 'Técnico 2' and estado = 'pendiente';
