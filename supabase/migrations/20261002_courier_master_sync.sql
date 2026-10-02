-- One current record per person. Old operational IDs are retained as aliases, not employee identities.
begin;
create table if not exists public.ops_courier_master (
  id uuid primary key default gen_random_uuid(),
  tgrid text not null unique check (tgrid = upper(trim(tgrid)) and tgrid ~ '^TGR(FL)?[A-Z0-9]+$'),
  employee_nik text unique references public.ops_employees(nik) on update cascade on delete set null,
  name text not null check (length(trim(name)) > 0),
  leader text not null default '', shift text not null default '', vehicle text not null default '',
  area text not null default '', district text not null default '', zone text not null default '',
  kanit text not null default '', code text not null default '', kpi text not null default '',
  active boolean not null default true, source_month date,
  updated_at timestamptz not null default now()
);
create table if not exists public.ops_courier_id_aliases (
  tgrid text primary key, courier_id uuid not null references public.ops_courier_master(id) on delete restrict,
  changed_at timestamptz not null default now()
);
create table if not exists public.ops_courier_master_revision (singleton boolean primary key default true check(singleton), revision bigint not null default 0);
insert into public.ops_courier_master_revision(singleton) values(true) on conflict do nothing;
create table if not exists public.ops_courier_master_changes (
  id bigint generated always as identity primary key, courier_id uuid not null references public.ops_courier_master(id),
  actor_email text not null, changes jsonb not null, source_month date not null, changed_at timestamptz not null default now()
);
do $$ begin
  if exists(select 1 from public.ops_employees where upper(trim(tgrid)) ~ '^TGR(FL)?[A-Z0-9]+$' group by upper(trim(tgrid)) having count(*)>1) then
    raise exception 'TGRID ganda pada master karyawan. Perbaiki sebelum migration.';
  end if;
end $$;
insert into public.ops_courier_master(tgrid,employee_nik,name,active)
select upper(trim(tgrid)),nik,name,active from public.ops_employees where upper(trim(tgrid)) ~ '^TGR(FL)?[A-Z0-9]+$'
on conflict do nothing;
alter table public.ops_courier_master enable row level security;
alter table public.ops_courier_id_aliases enable row level security;
alter table public.ops_courier_master_revision enable row level security;
alter table public.ops_courier_master_changes enable row level security;
revoke all on public.ops_courier_master,public.ops_courier_id_aliases,public.ops_courier_master_revision,public.ops_courier_master_changes from anon,authenticated;
grant all on public.ops_courier_master,public.ops_courier_id_aliases,public.ops_courier_master_revision,public.ops_courier_master_changes to service_role;
grant usage, select on sequence public.ops_courier_master_changes_id_seq to service_role;

create or replace function public.ops_sync_courier_master(p_revision bigint,p_operations jsonb,p_month date,p_actor text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_revision bigint; op jsonb; vals jsonb; target_id uuid; old_record public.ops_courier_master; changed integer:=0;
begin
  select revision into current_revision from public.ops_courier_master_revision where singleton=true for update;
  if current_revision<>p_revision then raise exception 'Data berubah setelah preview. Muat ulang preview sebelum menyimpan.'; end if;
  if jsonb_typeof(p_operations)<>'array' or jsonb_array_length(p_operations)>5000 then raise exception 'Batch tidak valid.'; end if;
  for op in select value from jsonb_array_elements(p_operations) loop
    vals:=op->'values'; target_id:=nullif(op->>'id','')::uuid;
    if target_id is not null then
      select * into old_record from public.ops_courier_master where id=target_id for update;
      if not found or old_record.tgrid<>op->>'old_tgrid' then raise exception 'Identitas kurir berubah. Ulangi preview.';end if;
      if old_record.tgrid<>vals->>'tgrid' then
        if old_record.tgrid not like 'TGRFL%' or vals->>'tgrid' like 'TGRFL%' then raise exception 'Perubahan ID hanya freelance ke reguler.';end if;
        if exists(select 1 from public.ops_courier_id_aliases where tgrid=vals->>'tgrid') then raise exception 'ID pernah digunakan.';end if;
        insert into public.ops_courier_id_aliases(tgrid,courier_id) values(old_record.tgrid,target_id);
      end if;
      update public.ops_courier_master set tgrid=vals->>'tgrid',name=vals->>'name',leader=vals->>'leader',shift=vals->>'shift',vehicle=vals->>'vehicle',area=vals->>'area',district=vals->>'district',zone=vals->>'zone',kanit=vals->>'kanit',code=vals->>'code',kpi=vals->>'kpi',source_month=p_month,updated_at=now() where id=target_id;
    else
      if exists(select 1 from public.ops_courier_id_aliases where tgrid=vals->>'tgrid') then raise exception 'ID lama tidak dapat digunakan kembali.';end if;
      insert into public.ops_courier_master(tgrid,name,leader,shift,vehicle,area,district,zone,kanit,code,kpi,source_month)
      values(vals->>'tgrid',vals->>'name',vals->>'leader',vals->>'shift',vals->>'vehicle',vals->>'area',vals->>'district',vals->>'zone',vals->>'kanit',vals->>'code',vals->>'kpi',p_month) returning id into target_id;
    end if;
    insert into public.ops_courier_master_changes(courier_id,actor_email,changes,source_month) values(target_id,p_actor,op->'changes',p_month);
    changed:=changed+1;
  end loop;
  if changed>0 then update public.ops_courier_master_revision set revision=revision+1 where singleton=true;end if;
  return jsonb_build_object('changed',changed);
end $$;
revoke all on function public.ops_sync_courier_master(bigint,jsonb,date,text) from public,anon,authenticated;
grant execute on function public.ops_sync_courier_master(bigint,jsonb,date,text) to service_role;
commit;
