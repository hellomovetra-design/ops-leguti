-- Run AFTER migration in a PostgreSQL test connection / Supabase SQL editor.
-- All fixtures and changes are rolled back; no production record is edited.
begin;
do $$
declare
  suffix text:=upper(replace(gen_random_uuid()::text,'-',''));
  n text; other_n text; t text; next_t text; master_id uuid; rev bigint; payload jsonb;
begin
  n:='TEST-'||suffix; other_n:=n||'-2'; t:='TGR'||suffix; next_t:='TGRFL'||suffix;
  payload:=jsonb_build_object('nik',n,'name','Test kurir','position','Kurir Motor Staff',
    'dept','Test','hub','Test','level','Staff','superior','','employment','PKWT','active',true,'tgrid',t);
  perform public.ops_save_employee_and_courier(payload,true,'test@example.invalid');
  select id into master_id from public.ops_courier_master where employee_nik=n and tgrid=t;
  if master_id is null then raise exception 'New courier was not linked by NIK'; end if;
  update public.ops_courier_master set area='Area test',district='Kecamatan test',zone='Z1',shift='Pagi',vehicle='Motor',kanit='Kanit test' where id=master_id;
  select revision into rev from public.ops_courier_master_revision where singleton;
  perform public.ops_save_employee_and_courier(payload||jsonb_build_object('name','Test kurir revised','tgrid',next_t),false,'test@example.invalid');
  if not exists(select 1 from public.ops_courier_master where id=master_id and employee_nik=n and tgrid=next_t
    and name='Test kurir revised' and area='Area test' and district='Kecamatan test'
    and zone='Z1' and shift='Pagi' and vehicle='Motor' and kanit='Kanit test') then
    raise exception 'Edit did not preserve master identity/operational fields';
  end if;
  if not exists(select 1 from public.ops_courier_id_aliases where tgrid=t and courier_id=master_id) then raise exception 'Old TGR alias missing'; end if;
  if (select revision from public.ops_courier_master_revision where singleton)<=rev then raise exception 'Import preview revision not invalidated'; end if;
  begin
    perform public.ops_save_employee_and_courier(payload||jsonb_build_object('nik',other_n,'tgrid',next_t),true,'test@example.invalid');
    raise exception 'TEST_DUPLICATE_ACCEPTED';
  exception when others then
    if SQLERRM='TEST_DUPLICATE_ACCEPTED' then raise; end if;
  end;
  if exists(select 1 from public.ops_employees where nik=other_n) then raise exception 'Failed duplicate left partial employee'; end if;
  perform public.ops_save_employee_and_courier(payload||jsonb_build_object('tgrid',next_t,'active',false,'employment','Resign'),false,'test@example.invalid');
  if exists(select 1 from public.ops_courier_master where id=master_id and active) then raise exception 'Resignation not reflected in master'; end if;
  if (select count(*) from public.ops_courier_master where employee_nik=n)<>1 then raise exception 'Duplicate master created'; end if;
  -- Requires the contact/identity migration. Correct NIK without creating a person.
  perform public.ops_save_employee_and_courier(payload||jsonb_build_object('original_nik',n,'nik',other_n,'tgrid',next_t,'phone','081234567890','email','test@example.invalid'),false,'test@example.invalid');
  if exists(select 1 from public.ops_employees where nik=n) then raise exception 'Old NIK still exists'; end if;
  if not exists(select 1 from public.ops_employees where nik=other_n and phone='081234567890' and email='test@example.invalid') then raise exception 'Corrected NIK/contacts not saved'; end if;
  if not exists(select 1 from public.ops_courier_master where id=master_id and employee_nik=other_n and tgrid=next_t) then raise exception 'NIK correction broke courier link'; end if;
end $$;
rollback;
