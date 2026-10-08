-- Manual employee edits and courier identity updates must commit together.
begin;
create or replace function public.ops_save_employee_and_courier(p_employee jsonb,p_create boolean,p_actor text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  e public.ops_employees; previous public.ops_employees;
  c public.ops_courier_master; before_master jsonb; after_master jsonb;
  target_nik text:=trim(p_employee->>'nik');
  target_tgrid text; courier boolean; has_master boolean:=false;
  synced boolean:=false; leader_id text; leader_name text;
begin
  -- Same lock order as bulk courier import; invalidates previously reviewed imports.
  perform 1 from public.ops_courier_master_revision where singleton for update;
  if not found then raise exception 'Master kurir belum siap.'; end if;
  if coalesce(target_nik,'')='' or coalesce(trim(p_employee->>'name'),'')='' then raise exception 'NIK dan nama wajib diisi.'; end if;
  select * into previous from public.ops_employees where nik=target_nik for update;
  if p_create and found then raise exception 'NIK sudah terdaftar. Gunakan edit karyawan.'; end if;
  if not p_create and not found then raise exception 'Karyawan tidak ditemukan. Muat ulang data.'; end if;
  select * into c from public.ops_courier_master where employee_nik=target_nik for update;
  has_master:=found;
  target_tgrid:=case when p_employee ? 'tgrid' then upper(trim(p_employee->>'tgrid'))
    else coalesce(c.tgrid,previous.tgrid,'') end;
  if target_tgrid<>'' and target_tgrid !~ '^TGR(FL)?[A-Z0-9]+$' then raise exception 'Format TGR ID tidak valid.'; end if;
  if target_tgrid<>'' and exists(select 1 from public.ops_employees where nik<>target_nik and upper(trim(tgrid))=target_tgrid) then
    raise exception 'TGR ID sudah digunakan karyawan lain.';
  end if;
  -- Never match by name alone. An exact operational ID can link only an unlinked
  -- record with the same name; a different name requires explicit identity review.
  if not has_master and target_tgrid<>'' then
    select * into c from public.ops_courier_master where tgrid=target_tgrid for update;
    has_master:=found;
    if has_master and (c.employee_nik is not null and c.employee_nik<>target_nik
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
    insert into public.ops_employees(nik,name,position,dept,hub,level,superior,employment,active,tgrid)
    values(target_nik,trim(p_employee->>'name'),p_employee->>'position',p_employee->>'dept',p_employee->>'hub',p_employee->>'level',p_employee->>'superior',p_employee->>'employment',(p_employee->>'active')::boolean,nullif(target_tgrid,''))
    returning * into e;
  else
    update public.ops_employees set name=trim(p_employee->>'name'),position=p_employee->>'position',
      dept=p_employee->>'dept',hub=p_employee->>'hub',level=p_employee->>'level',
      superior=p_employee->>'superior',employment=p_employee->>'employment',
      active=(p_employee->>'active')::boolean,tgrid=nullif(target_tgrid,'')
      where nik=target_nik returning * into e;
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
revoke all on function public.ops_save_employee_and_courier(jsonb,boolean,text) from public,anon,authenticated;
grant execute on function public.ops_save_employee_and_courier(jsonb,boolean,text) to service_role;
commit;
