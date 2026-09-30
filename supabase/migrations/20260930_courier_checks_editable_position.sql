-- Preserve existing examinations while allowing the database job title or a manual correction.
begin;
alter table public.ops_courier_checks drop constraint if exists ops_courier_checks_position_check;
alter table public.ops_courier_checks add constraint ops_courier_checks_position_check
  check (length(trim(position)) between 1 and 160);
commit;
