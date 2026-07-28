-- Migración: nombres reales de técnicos
-- Correr en: Supabase → SQL Editor → New query → Run
--
-- Renombra los técnicos placeholder ('Técnico 1', 'Técnico 2') por los
-- nombres reales y da de alta a Armando Ochoa como técnico nuevo. Las
-- órdenes ya creadas (de prueba) no se tocan; esto solo afecta el catálogo
-- de técnicos que se ofrece al crear órdenes nuevas.

update tecnicos set nombre = 'Alberto Zavala Orozco' where nombre = 'Técnico 1';
update tecnicos set nombre = 'Jorge Barbosa Soto' where nombre = 'Técnico 2';

insert into tecnicos (nombre)
select 'Armando Ochoa'
where not exists (select 1 from tecnicos where nombre = 'Armando Ochoa');
