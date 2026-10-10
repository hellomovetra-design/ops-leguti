begin;
create table if not exists public.ops_personnel_changes (
 id uuid primary key default gen_random_uuid(),
 transaction_id bigint not null,
 employee_nik text not null,
 employee_name text not null default '',
 action text not null check(action in ('create','update','delete')),
 actor_email text,
 before_data jsonb,
 after_data jsonb,
 created_at timestamptz not null default now()
);
create index if not exists ops_personnel_changes_date on public.ops_personnel_changes(created_at desc,id);
create index if not exists ops_personnel_changes_nik on public.ops_personnel_changes(employee_nik);
create index if not exists ops_personnel_changes_transaction on public.ops_personnel_changes(transaction_id);
alter table public.ops_personnel_changes enable row level security;
revoke all on public.ops_personnel_changes from public,anon,authenticated;
grant select,insert,update,delete on public.ops_personnel_changes to service_role;

create or replace function public.ops_record_personnel_change()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
 old_data jsonb; new_data jsonb; entry public.ops_personnel_changes;
 actor text; headers jsonb; claims jsonb; previous_nik text;
 fields text[]:=array['nik','tgrid','name','position','dept','hub','level','superior','superior_nik','employment','employment_type','active','phone','email','start_date'];
begin
 if tg_op<>'INSERT' then
  select jsonb_object_agg(key,value) into old_data from jsonb_each(to_jsonb(old)) where key=any(fields);
  previous_nik:=old.nik;
 end if;
 if tg_op<>'DELETE' then
  select jsonb_object_agg(key,value) into new_data from jsonb_each(to_jsonb(new)) where key=any(fields);
 end if;
 if old_data is not distinct from new_data then return null; end if;
 -- Attribution is trusted only for service-role writes; direct SQL remains unattributed.
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
 if claims->>'role'='service_role' then
  headers:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb);
  actor:=nullif(trim(headers->>'x-ops-actor'),'');
 end if;
 -- RPC may update identity, contacts and employment in several statements.
 -- Collapse changes to the same employee in one transaction into one before/after record.
 select * into entry from public.ops_personnel_changes
 where transaction_id=txid_current()
 and (after_data->>'nik'=previous_nik or employee_nik=coalesce(previous_nik,new_data->>'nik'))
 order by created_at desc limit 1 for update;
 if found then
  if entry.before_data is not distinct from new_data then
   delete from public.ops_personnel_changes where id=entry.id;
  else
   update public.ops_personnel_changes set after_data=new_data,
    employee_nik=coalesce(new_data->>'nik',entry.employee_nik),
    employee_name=coalesce(new_data->>'name',entry.employee_name),
    action=case when new_data is null then 'delete' when entry.before_data is null then 'create' else 'update' end,
    actor_email=coalesce(actor,entry.actor_email) where id=entry.id;
  end if;
 else
  insert into public.ops_personnel_changes(transaction_id,employee_nik,employee_name,action,actor_email,before_data,after_data)
  values(txid_current(),coalesce(new_data->>'nik',old_data->>'nik'),coalesce(new_data->>'name',old_data->>'name',''),
   case tg_op when 'INSERT' then 'create' when 'DELETE' then 'delete' else 'update' end,actor,old_data,new_data);
 end if;
 return null;
end $$;
revoke all on function public.ops_record_personnel_change() from public,anon,authenticated;
drop trigger if exists ops_record_personnel_change on public.ops_employees;
create trigger ops_record_personnel_change after insert or update or delete on public.ops_employees
 for each row execute function public.ops_record_personnel_change();
commit;
-- No historical rows are fabricated or backfilled.
