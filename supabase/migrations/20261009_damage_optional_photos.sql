begin;
-- Retain all existing reports, allowing one to four photos for new reports.
alter table public.ops_damage_cases drop constraint if exists ops_damage_cases_photos_check;
alter table public.ops_damage_cases add constraint ops_damage_cases_photos_check
  check(jsonb_typeof(photos)='array' and jsonb_array_length(photos) between 1 and 4);
commit;
