begin;
alter table public.ops_employee_sanctions add column if not exists photos jsonb not null default '[]'::jsonb;
alter table public.ops_employee_sanctions drop constraint if exists ops_sanction_photo_array;
alter table public.ops_employee_sanctions add constraint ops_sanction_photo_array
 check(jsonb_typeof(photos)='array' and jsonb_array_length(photos)<=3);
-- Existing records remain readable; every new or edited record needs evidence.
create or replace function public.ops_sanction_require_photo() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if jsonb_array_length(new.photos)<1 then raise exception 'Bukti wajib minimal 1 foto dan maksimal 3 foto.'; end if;
 return new;
end $$;
revoke all on function public.ops_sanction_require_photo() from public,anon,authenticated;
drop trigger if exists ops_sanction_require_photo on public.ops_employee_sanctions;
create trigger ops_sanction_require_photo before insert or update on public.ops_employee_sanctions
 for each row execute function public.ops_sanction_require_photo();
commit;
