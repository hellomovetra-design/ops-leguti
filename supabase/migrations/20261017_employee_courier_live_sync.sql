-- Requires employee contacts/identity, employment_type and hierarchy NIK migrations.
-- The public employment wrapper remains installed and calls this core.
begin;
create or replace function public.ops_save_employee_and_courier_core(p_employee jsonb,p_create boolean,p_actor text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  e public.ops_employees; previous public.ops_employees;
  c public.ops_courier_master; before_master jsonb; after_master jsonb;
  target_nik text:=trim(p_employee->>'nik');
  original_nik text:=coalesce(nullif(trim(p_employee->>'original_nik'),''),trim(p_employee->>'nik'));
  target_tgrid text; courier boolean; has_master boolean:=false;
  synced boolean:=false; leader_id text; leader_name text;
begin
  if p_employee ? 'superior_nik' and nullif(trim(p_employee->>'superior_nik'),'') is not null then
    if p_employee->>'superior_nik' in (target_nik,original_nik) then raise exception 'Atasan tidak boleh diri sendiri.'; end if;
    select name into leader_name from public.ops_employees where nik=p_employee->>'superior_nik'
      and active and position ~* '(leader|coordinator|koordinator|supervisor|spv)';
    if not found then raise exception 'Pilih Leader, Koordinator, atau SPV aktif dari daftar.'; end if;
    p_employee:=p_employee||jsonb_build_object('superior',leader_name);
    leader_name:=null;
  end if;
  -- Same lock order as bulk courier import; invalidates previously reviewed imports.
  perform 1 from public.ops_courier_master_revision where singleton for update;
  if not found then raise exception 'Master kurir belum siap.'; end if;
  if coalesce(target_nik,'')='' or coalesce(trim(p_employee->>'name'),'')='' then raise exception 'NIK dan nama wajib diisi.'; end if;
  select * into previous from public.ops_employees where nik=original_nik for update;
  if p_create and found then raise exception 'NIK sudah terdaftar. Gunakan edit karyawan.'; end if;
  if not p_create and not found then raise exception 'Karyawan tidak ditemukan. Muat ulang data.'; end if;
  if target_nik<>original_nik and exists(select 1 from public.ops_employees where nik=target_nik) then raise exception 'NIK baru sudah digunakan karyawan lain.'; end if;
  if p_create and target_nik<>original_nik then raise exception 'Identitas karyawan baru tidak valid.'; end if;
  select * into c from public.ops_courier_master where employee_nik=original_nik for update;
  has_master:=found;
  target_tgrid:=case when p_employee ? 'tgrid' then upper(trim(p_employee->>'tgrid'))
    else coalesce(c.tgrid,previous.tgrid,'') end;
  if target_tgrid<>'' and target_tgrid !~ '^TGR(FL)?[A-Z0-9]+$' then raise exception 'Format TGR ID tidak valid.'; end if;
  if target_tgrid<>'' and exists(select 1 from public.ops_employees where nik<>original_nik and upper(trim(tgrid))=target_tgrid) then
    raise exception 'TGR ID sudah digunakan karyawan lain.';
  end if;
  -- Never match by name alone. An exact operational ID can link only an unlinked
  -- record with the same name; a different name requires explicit identity review.
  if not has_master and target_tgrid<>'' then
    select * into c from public.ops_courier_master where tgrid=target_tgrid for update;
    has_master:=found;
    if has_master and (c.employee_nik is not null and c.employee_nik<>original_nik
       or lower(regexp_replace(trim(c.name),'\s+',' ','g'))<>lower(regexp_replace(trim(coalesce(previous.name,p_employee->>'name')),'\s+',' ','g'))) then
      raise exception 'TGR ID terdaftar pada master lain. Periksa identitas sebelum mengaitkan.';
    end if;
  end if;
  if target_tgrid<>'' and exists(select 1 from public.ops_courier_id_aliases where tgrid=target_tgrid) then raise exception 'TGR ID lama tidak boleh digunakan kembali.'; end if;
  if has_master then
    if target_tgrid='' then raise exception 'TGR ID master kurir tidak boleh dikosongkan.'; end if;
    if c.tgrid<>target_tgrid and exists(select 1 from public.ops_courier_master where tgrid=target_tgrid and id<>c.id) then raise exception 'TGR ID sudah dipakai master lain.'; end if;
    before_master:=to_jsonb(c);
  end if;
  if p_create then
    insert into public.ops_employees(nik,name,position,dept,hub,level,superior,superior_nik,employment,active,tgrid,phone,email)
    values(target_nik,trim(p_employee->>'name'),p_employee->>'position',p_employee->>'dept',p_employee->>'hub',p_employee->>'level',p_employee->>'superior',nullif(trim(p_employee->>'superior_nik'),''),p_employee->>'employment',(p_employee->>'active')::boolean,nullif(target_tgrid,''),nullif(trim(p_employee->>'phone'),''),nullif(lower(trim(p_employee->>'email')),''))
    returning * into e;
  else
    update public.ops_employees set nik=target_nik,name=trim(p_employee->>'name'),position=p_employee->>'position',
      dept=p_employee->>'dept',hub=p_employee->>'hub',level=p_employee->>'level',
      superior=p_employee->>'superior',superior_nik=case when p_employee ? 'superior_nik' then nullif(trim(p_employee->>'superior_nik'),'') else superior_nik end,employment=p_employee->>'employment',
      active=(p_employee->>'active')::boolean,tgrid=nullif(target_tgrid,''),
            phone=case when p_employee ? 'phone' then nullif(trim(p_employee->>'phone'),'') else phone end,
      email=case when p_employee ? 'email' then nullif(lower(trim(p_employee->>'email')),'') else email end
      where nik=original_nik returning * into e;
  end if;
  courier:=coalesce(e.position,'') ~* '(kurir|rider|driver)';
  -- Also keep an existing linked master consistent when a courier changes role.
  if courier or has_master then
    if target_tgrid<>'' then
      if courier and e.superior_nik is not null then
        select nik,name into leader_id,leader_name from public.ops_employees
          where nik=e.superior_nik and active and position ~* 'inbound.*delivery.*leader';
      end if;
      if has_master then
        if leader_id is null and e.superior_nik is not distinct from previous.superior_nik
          and e.superior is not distinct from previous.superior then
          leader_id:=c.leader_nik; leader_name:=c.leader;
        end if;
        if c.tgrid<>target_tgrid then
          insert into public.ops_courier_id_aliases(tgrid,courier_id) values(c.tgrid,c.id);
        end if;
        update public.ops_courier_master set employee_nik=e.nik,tgrid=target_tgrid,name=e.name,
          active=case when not courier and coalesce(previous.position,'') ~* '(kurir|rider|driver)' then false else e.active end,
          leader=case when courier then coalesce(leader_name,'') else leader end,
          leader_nik=case when courier then leader_id else leader_nik end,
          updated_at=now() where id=c.id returning * into c;
      else
        insert into public.ops_courier_master(tgrid,employee_nik,name,active,leader,leader_nik)
          values(target_tgrid,e.nik,e.name,e.active,coalesce(leader_name,''),leader_id) returning * into c;
      end if;
      after_master:=to_jsonb(c);
      if before_master is null or (before_master-'updated_at') is distinct from (after_master-'updated_at') then
        insert into public.ops_courier_master_changes(courier_id,actor_email,changes,source_month)
          values(c.id,p_actor,jsonb_build_object('source','employee_edit','before',before_master,'after',after_master),coalesce(c.source_month,date_trunc('month',now())::date));
        update public.ops_courier_master_revision set revision=revision+1 where singleton;
      end if;
      synced:=true;
    end if;
  end if;
  return jsonb_build_object('courier_synced',synced);
end $$;
revoke all on function public.ops_save_employee_and_courier_core(jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.ops_save_employee_and_courier_core(jsonb,boolean,text) to service_role;

-- Serialize all employee writes in the same order as manual edits and courier imports.
create or replace function public.ops_employee_master_lock() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from public.ops_courier_master_revision where singleton for update;
 if not found then raise exception 'Master kurir belum siap.'; end if;
 return null;
end $$;
revoke all on function public.ops_employee_master_lock() from public,anon,authenticated;
drop trigger if exists ops_employee_master_lock on public.ops_employees;
create trigger ops_employee_master_lock before insert or update or delete on public.ops_employees
for each statement execute function public.ops_employee_master_lock();

create or replace function public.ops_refresh_employee_courier(p_nik text,p_previous_position text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.ops_employees; c public.ops_courier_master; leader_person public.ops_employees;
 is_courier boolean; desired_active boolean; operational_id text; leader_id text; leader_name text;
 before_row jsonb; after_row jsonb; actor text; claims jsonb;
begin
 select * into e from public.ops_employees where nik=p_nik;
 if not found then return false; end if;
 is_courier:=coalesce(e.position,'') ~* '(kurir|rider|driver)';
 operational_id:=nullif(upper(trim(e.tgrid)),'');
 select * into c from public.ops_courier_master where employee_nik=e.nik for update;
 if not found and operational_id is not null then
  select * into c from public.ops_courier_master where tgrid=operational_id for update;
  if found then
   if c.employee_nik is not null and c.employee_nik<>e.nik then raise exception 'TGR ID sudah terhubung ke NIK lain.'; end if;
   if lower(regexp_replace(trim(c.name),'\s+',' ','g'))<>lower(regexp_replace(trim(e.name),'\s+',' ','g')) then
    raise exception 'TGR ID memiliki nama berbeda. Tinjau identitas melalui edit karyawan.';
   end if;
  end if;
 end if;
 if c.id is null and (not is_courier or operational_id is null) then return false; end if;
 if operational_id is null then operational_id:=c.tgrid; end if;
 if operational_id !~ '^TGR(FL)?[A-Z0-9]+$' then raise exception 'Format TGR ID tidak valid.'; end if;
 if exists(select 1 from public.ops_employees where nik<>e.nik and upper(trim(tgrid))=operational_id) then raise exception 'TGR ID ganda di data karyawan.'; end if;
 if is_courier then
  select * into leader_person from public.ops_employees where nik=e.superior_nik
    and active and position ~* 'inbound.*delivery.*leader';
  if found then leader_id:=leader_person.nik;leader_name:=leader_person.name; end if;
 elsif c.id is not null then
  -- The workbook can also contain leaders / Kanit with a TGR ID.
  select * into leader_person from public.ops_employees where nik=c.leader_nik and active and position ~* 'inbound.*delivery.*leader';
  if found then leader_id:=leader_person.nik;leader_name:=leader_person.name; end if;
 end if;
 desired_active:=e.active and case when is_courier then true
  when coalesce(p_previous_position,'') ~* '(kurir|rider|driver)' then false
  else coalesce(c.active,true) end;
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}');
 if claims->>'role'='service_role' then actor:=nullif(trim(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}')->>'x-ops-actor'),'');end if;
 if c.id is not null then
  if (c.employee_nik,c.tgrid,c.name,c.active,coalesce(c.leader,''),c.leader_nik)
    is not distinct from (e.nik,operational_id,e.name,desired_active,coalesce(leader_name,''),leader_id) then return false; end if;
  before_row:=to_jsonb(c);
  if c.tgrid<>operational_id then
   if exists(select 1 from public.ops_courier_id_aliases where tgrid=operational_id) then raise exception 'TGR ID lama tidak boleh digunakan kembali.';end if;
   insert into public.ops_courier_id_aliases(tgrid,courier_id) values(c.tgrid,c.id);
  end if;
  -- Preserve operational area, district, shift, vehicle, Kanit, code and KPI.
  update public.ops_courier_master set employee_nik=e.nik,tgrid=operational_id,name=e.name,active=desired_active,
   leader_nik=leader_id,leader=coalesce(leader_name,''),updated_at=clock_timestamp()
   where id=c.id returning * into c;
 else
  if exists(select 1 from public.ops_courier_id_aliases where tgrid=operational_id) then raise exception 'TGR ID lama tidak boleh digunakan kembali.';end if;
  insert into public.ops_courier_master(tgrid,employee_nik,name,active,leader,leader_nik)
   values(operational_id,e.nik,e.name,desired_active,coalesce(leader_name,''),leader_id) returning * into c;
 end if;
 after_row:=to_jsonb(c);
 insert into public.ops_courier_master_changes(courier_id,actor_email,changes,source_month)
 values(c.id,coalesce(actor,'system:employee_sync'),jsonb_build_object('source','employee_live_sync','before',before_row,'after',after_row),coalesce(c.source_month,date_trunc('month',now())::date));
 update public.ops_courier_master_revision set revision=revision+1 where singleton;
 return true;
end $$;
revoke all on function public.ops_refresh_employee_courier(text,text) from public,anon,authenticated;

-- Defer until the end of the transaction: the existing manual save/import functions
-- may change identity and master data in several statements. Sync the FINAL row only.
create or replace function public.ops_employee_courier_live_sync() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare previous_position text; member_nik text;
begin
 if tg_op='UPDATE' then previous_position:=old.position; end if;
 perform public.ops_refresh_employee_courier(new.nik,previous_position);
 -- Changing a leader's name/status also updates the linked master leader labels.
 if tg_op='UPDATE' and (new.name,new.position,new.active) is distinct from (old.name,old.position,old.active) then
  for member_nik in select nik from public.ops_employees where superior_nik=new.nik
    union select employee_nik from public.ops_courier_master where leader_nik=new.nik and employee_nik is not null loop
   perform public.ops_refresh_employee_courier(member_nik);
  end loop;
 end if;
 return null;
end $$;
revoke all on function public.ops_employee_courier_live_sync() from public,anon,authenticated;
drop trigger if exists ops_employee_courier_live_sync on public.ops_employees;
create constraint trigger ops_employee_courier_live_sync after insert or update on public.ops_employees
deferrable initially deferred for each row execute function public.ops_employee_courier_live_sync();

-- Repair existing linked rows and add couriers missing from master. Ambiguous or
-- conflicting identities are left untouched for manual review; no name-only links.
do $$
declare person record;
begin
 perform 1 from public.ops_courier_master_revision where singleton for update;
 for person in select nik from public.ops_employees order by nik loop
  begin
   perform public.ops_refresh_employee_courier(person.nik);
  exception when unique_violation or raise_exception then
   raise notice 'Courier sync skipped conflicting identity for NIK %',person.nik;
  end;
 end loop;
end $$;
commit;

