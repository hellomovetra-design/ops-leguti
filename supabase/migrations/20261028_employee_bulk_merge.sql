-- Additive structural import: absence and uploaded STATUS never deactivate employees.
-- Requires hierarchy NIK and employee_courier_live_sync migrations.
begin;
create or replace function public.ops_merge_employee_batch(p_rows jsonb,p_actor text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 item jsonb; clean jsonb; normalized jsonb:='[]'; field text; val text; target text;
 seen text[]:='{}'; before_rows jsonb; old_row public.ops_employees;
 boss text; boss_name text; added integer:=0; updated integer:=0; unchanged integer:=0;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Batch tidak valid.'; end if;
 if jsonb_array_length(p_rows) not between 1 and 5000 then raise exception 'Unggah 1–5000 baris.'; end if;
 perform 1 from public.ops_courier_master_revision where singleton for update;
 if not found then raise exception 'Master kurir belum siap.'; end if;
 -- Validate before the first write, including requests that bypass the application.
 for item in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(item) is distinct from 'object' then raise exception 'Baris tidak valid.'; end if;
  clean:='{}';
  foreach field in array array['nik','name','position','dept','hub','level','superior','superior_nik'] loop
   val:=nullif(regexp_replace(trim(item->>field),'\s+',' ','g'),'');
   if length(val)>(case when field in ('nik','superior_nik') then 80 else 250 end) then raise exception 'Isian terlalu panjang.'; end if;
   if val is not null then clean:=clean||jsonb_build_object(field,val); end if;
  end loop;
  target:=clean->>'nik';
  if target is null or clean->>'name' is null then raise exception 'NIK dan nama wajib di setiap baris.'; end if;
  if target=any(seen) then raise exception 'NIK ganda: %',target; end if;
  seen:=array_append(seen,target); normalized:=normalized||jsonb_build_array(clean);
 end loop;
 select coalesce(jsonb_object_agg(nik,to_jsonb(e)),'{}') into before_rows from public.ops_employees e where nik=any(seen);
 -- First install all names/jobs so a supervisor later in the file can be resolved.
 for item in select value from jsonb_array_elements(normalized) loop
  target:=item->>'nik';
  select * into old_row from public.ops_employees where nik=target for update;
  if not found then
   if not (item ? 'position') then raise exception 'Jabatan karyawan baru NIK % wajib diisi.',target; end if;
   insert into public.ops_employees(nik,name,position,dept,hub,level,active,employment)
    values(target,item->>'name',item->>'position',item->>'dept',item->>'hub',item->>'level',true,'Aktif');
  else
   update public.ops_employees e set name=item->>'name',position=coalesce(item->>'position',e.position),
    dept=coalesce(item->>'dept',e.dept),hub=coalesce(item->>'hub',e.hub),level=coalesce(item->>'level',e.level)
   where e.nik=target and (e.name,e.position,e.dept,e.hub,e.level) is distinct from
    (item->>'name',coalesce(item->>'position',e.position),coalesce(item->>'dept',e.dept),coalesce(item->>'hub',e.hub),coalesce(item->>'level',e.level));
  end if;
 end loop;
 for item in select value from jsonb_array_elements(normalized) loop
  target:=item->>'nik';
  if item ? 'superior_nik' or item ? 'superior' then
   boss:=coalesce(item->>'superior_nik',public.ops_resolve_superior_nik(item->>'superior'));
   select name into boss_name from public.ops_employees where nik=boss and active
    and position ~* '(leader|coordinator|koordinator|supervisor|spv)';
   if not found or boss=target then raise exception 'Atasan untuk NIK % tidak valid/ambigu. Pilih NIK atasan yang benar.',target; end if;
   update public.ops_employees set superior_nik=boss,superior=boss_name where nik=target
    and (superior_nik,superior) is distinct from (boss,boss_name);
  end if;
  select * into old_row from public.ops_employees where nik=target;
  if not (before_rows ? target) then added:=added+1;
  elsif before_rows->target is distinct from to_jsonb(old_row) then updated:=updated+1;
  else unchanged:=unchanged+1; end if;
 end loop;
 return jsonb_build_object('added',added,'updated',updated,'unchanged',unchanged,'imported',added+updated,'deactivated',0);
end $$;
revoke all on function public.ops_merge_employee_batch(jsonb,text) from public,anon,authenticated;
grant execute on function public.ops_merge_employee_batch(jsonb,text) to service_role;
commit;
