begin;
alter table public.ops_employees add column if not exists employment_type text;
update public.ops_employees set employment_type=case
  when upper(trim(employment)) in ('PKWTT','TETAP','KARYAWAN TETAP','PERMANENT') then 'permanent'
  when upper(trim(employment)) in ('PKWT','KONTRAK','KARYAWAN KONTRAK') then 'contract'
  when upper(trim(employment)) in ('OUTSOURCE','OUTSOURCING','OUTSOURCED','OS','ALIH DAYA','FREELANCE','FREELANCER','FL') then 'outsource'
  else 'unknown' end where employment_type is null;
alter table public.ops_employees alter column employment_type set default 'unknown';
alter table public.ops_employees alter column employment_type set not null;
alter table public.ops_employees drop constraint if exists ops_employees_employment_type_check;
alter table public.ops_employees add constraint ops_employees_employment_type_check
  check(employment_type in ('permanent','contract','outsource','unknown'));

-- Keep existing bulk imports compatible, without overwriting the category on resign.
create or replace function public.ops_employee_employment_category()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare category text;
begin
  if TG_OP='UPDATE' then
    if new.employment_type is distinct from old.employment_type
      or new.employment is not distinct from old.employment then return new; end if;
  end if;
  category:=case
    when upper(trim(new.employment)) in ('PKWTT','TETAP','KARYAWAN TETAP','PERMANENT') then 'permanent'
    when upper(trim(new.employment)) in ('PKWT','KONTRAK','KARYAWAN KONTRAK') then 'contract'
    when upper(trim(new.employment)) in ('OUTSOURCE','OUTSOURCING','OUTSOURCED','OS','ALIH DAYA','FREELANCE','FREELANCER','FL') then 'outsource'
    else null end;
  if category is not null then new.employment_type:=category; end if;
  return new;
end $$;
drop trigger if exists ops_employee_employment_category on public.ops_employees;
create trigger ops_employee_employment_category before insert or update on public.ops_employees
  for each row execute function public.ops_employee_employment_category();

-- Preserve the installed NIK/contact/courier synchronization function unchanged.
do $$
begin
  if to_regprocedure('public.ops_save_employee_and_courier_core(jsonb,boolean,text)') is null then
    alter function public.ops_save_employee_and_courier(jsonb,boolean,text)
      rename to ops_save_employee_and_courier_core;
  end if;
end $$;
create or replace function public.ops_save_employee_and_courier(p_employee jsonb,p_create boolean,p_actor text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; category text:=p_employee->>'employment_type';
begin
  if p_employee ? 'employment_type' and
    (category is null or category not in ('permanent','contract','outsource','unknown')) then
    raise exception 'Status kepegawaian tidak valid.';
  end if;
  result:=public.ops_save_employee_and_courier_core(p_employee,p_create,p_actor);
  if p_employee ? 'employment_type' then
    update public.ops_employees set employment_type=category where nik=trim(p_employee->>'nik');
    if not found then raise exception 'Karyawan tidak ditemukan.'; end if;
  end if;
  return result;
end $$;
revoke all on function public.ops_save_employee_and_courier_core(jsonb,boolean,text) from public,anon,authenticated;
revoke all on function public.ops_save_employee_and_courier(jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.ops_save_employee_and_courier(jsonb,boolean,text) to service_role;
commit;
