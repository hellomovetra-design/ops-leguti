begin;
create table if not exists public.ops_employee_sanctions (
 id uuid primary key,
 employee_nik text not null check(length(trim(employee_nik)) between 1 and 80),
 employee_name text not null, position text not null default '',
 superior_nik text, superior_name text not null default '', hub text not null default '',
 kind text not null check(kind in ('coaching','st','sp1','sp2','sp3','hc_ga')),
 incident_date date not null,
 description text not null check(length(trim(description)) between 1 and 10000),
 coaching_result text not null default '' check(length(coaching_result)<=10000),
 created_by text not null, updated_by text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(kind<>'coaching' or length(trim(coaching_result))>0)
);
create index if not exists ops_employee_sanctions_owner on public.ops_employee_sanctions(created_by,created_at desc,id);
create index if not exists ops_employee_sanctions_employee on public.ops_employee_sanctions(employee_nik,created_at desc);
create index if not exists ops_employee_sanctions_date on public.ops_employee_sanctions(created_at desc,id);
create index if not exists ops_employee_sanctions_kind on public.ops_employee_sanctions(kind,created_at desc,id);
create table if not exists public.ops_employee_sanction_history (
 id bigint generated always as identity primary key,
 sanction_id uuid not null references public.ops_employee_sanctions(id),
 actor_email text not null, before_data jsonb, after_data jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.ops_employee_sanctions enable row level security;
alter table public.ops_employee_sanction_history enable row level security;
revoke all on public.ops_employee_sanctions,public.ops_employee_sanction_history from public,anon,authenticated,service_role;
grant select,insert,update on public.ops_employee_sanctions to service_role;
grant select on public.ops_employee_sanction_history to service_role;
create or replace function public.ops_sanction_timestamp() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 new.id:=old.id; new.created_at:=old.created_at; new.created_by:=old.created_by;
 new.employee_nik:=old.employee_nik; new.employee_name:=old.employee_name; new.position:=old.position;
 new.superior_nik:=old.superior_nik; new.superior_name:=old.superior_name; new.hub:=old.hub;
 new.updated_at:=clock_timestamp(); return new;
end $$;
create or replace function public.ops_sanction_audit() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.ops_employee_sanction_history(sanction_id,actor_email,before_data,after_data)
 values(new.id,new.updated_by,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return null;
end $$;
revoke all on function public.ops_sanction_timestamp(),public.ops_sanction_audit() from public,anon,authenticated;
drop trigger if exists ops_sanction_timestamp on public.ops_employee_sanctions;
create trigger ops_sanction_timestamp before update on public.ops_employee_sanctions for each row execute function public.ops_sanction_timestamp();
drop trigger if exists ops_sanction_audit on public.ops_employee_sanctions;
create trigger ops_sanction_audit after insert or update on public.ops_employee_sanctions for each row execute function public.ops_sanction_audit();
commit;
