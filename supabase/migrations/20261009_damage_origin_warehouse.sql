begin;
-- The existing trip field now stores Origin Warehouse for new PWA reports.
-- Retain historical fleet data; new reports no longer require Armada.
alter table public.ops_damage_cases drop constraint if exists ops_damage_cases_fleet_check;
alter table public.ops_damage_cases add constraint ops_damage_cases_fleet_check
  check(length(trim(fleet)) <= 160);
alter table public.ops_damage_cases alter column fleet set default '';
commit;
