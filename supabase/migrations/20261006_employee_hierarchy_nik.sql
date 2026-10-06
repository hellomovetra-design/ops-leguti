-- Stable hierarchy identities. Courier master is the current placement source.
begin;
alter table public.ops_employees add column if not exists superior_nik text references public.ops_employees(nik) on update cascade on delete set null;
alter table public.ops_courier_master add column if not exists leader_nik text references public.ops_employees(nik) on update cascade on delete set null;
create index if not exists ops_employees_superior_nik_idx on public.ops_employees(superior_nik);
create table if not exists public.ops_employee_name_aliases (
  alias text primary key,
  employee_nik text not null references public.ops_employees(nik) on update cascade on delete cascade
);
alter table public.ops_employee_name_aliases enable row level security;
revoke all on public.ops_employee_name_aliases from anon, authenticated;
grant all on public.ops_employee_name_aliases to service_role;

do $$ begin
  if (select count(*) from public.ops_employees where active and (nik,name) in (
    ('14060562','Joko Ariyanto'), ('10060062','Akh Sinjen'),
    ('12100278','Muhamad Bani Adam Arsyad'), ('12120295','Ahmad Syaripudin')
  )) <> 4 then raise exception 'Identitas empat leader berubah; audit ulang sebelum migration.'; end if;
end $$;
insert into public.ops_employee_name_aliases(alias,employee_nik) values
  ('joko arianto','14060562'), ('akh sin jen','10060062'),
  ('m bani adam','12100278'), ('ahmad syarifudin','12120295')
on conflict(alias) do update set employee_nik=excluded.employee_nik;

create or replace function public.ops_resolve_superior_nik(p_name text)
returns text language sql stable set search_path=public,pg_temp as $$
  with candidates as (
    select nik from public.ops_employees where active
      and lower(regexp_replace(trim(name),'\s+',' ','g'))=lower(regexp_replace(trim(p_name),'\s+',' ','g'))
    union
    select a.employee_nik from public.ops_employee_name_aliases a
      join public.ops_employees e on e.nik=a.employee_nik and e.active
      where a.alias=lower(regexp_replace(trim(p_name),'\s+',' ','g'))
  ) select case when count(*)=1 then min(nik) else null end from candidates;
$$;
revoke all on function public.ops_resolve_superior_nik(text) from public,anon,authenticated;
grant execute on function public.ops_resolve_superior_nik(text) to service_role;

create or replace function public.ops_employee_hierarchy_link()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if TG_OP='INSERT' then
    if new.superior_nik is null then new.superior_nik:=public.ops_resolve_superior_nik(new.superior); end if;
  elsif new.superior_nik is not distinct from old.superior_nik and new.superior is distinct from old.superior then
    new.superior_nik:=public.ops_resolve_superior_nik(new.superior);
  end if;
  if new.superior_nik is not null then
    if new.superior_nik=new.nik then raise exception 'Personel tidak boleh menjadi atasan dirinya sendiri.'; end if;
    if exists(with recursive ancestors as (
      select nik,superior_nik from public.ops_employees where nik=new.superior_nik
      union select e.nik,e.superior_nik from public.ops_employees e join ancestors a on e.nik=a.superior_nik
    ) select 1 from ancestors where nik=new.nik) then raise exception 'Hubungan atasan membentuk siklus.'; end if;
    select name into new.superior from public.ops_employees where nik=new.superior_nik;
  end if;
  return new;
end $$;
create or replace trigger ops_employee_hierarchy_link before insert or update on public.ops_employees
for each row execute function public.ops_employee_hierarchy_link();

-- Resolve all existing, unambiguous relationships, including the four approved aliases.
update public.ops_employees e set superior_nik=public.ops_resolve_superior_nik(e.superior)
where e.superior_nik is null and public.ops_resolve_superior_nik(e.superior) is not null
  and public.ops_resolve_superior_nik(e.superior)<>e.nik;

create or replace function public.ops_courier_leader_link()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if TG_OP='INSERT' then
    if new.leader_nik is null then new.leader_nik:=public.ops_resolve_superior_nik(new.leader); end if;
  elsif new.leader_nik is not distinct from old.leader_nik and new.leader is distinct from old.leader then
    new.leader_nik:=public.ops_resolve_superior_nik(new.leader);
  end if;
  if trim(coalesce(new.leader,''))<>'' and new.leader_nik is null then
    raise exception 'Leader tidak ditemukan atau ambigu. Kaitkan dengan NIK personel yang benar.';
  end if;
  if new.leader_nik is not null and not exists(select 1 from public.ops_employees where nik=new.leader_nik and active and position ~* 'inbound.*delivery.*leader') then
    raise exception 'NIK leader bukan Inbound Delivery Leader aktif.';
  end if;
  -- Match missing employee identity only by unique TGRID, never by fuzzy person name.
  if new.employee_nik is null then
    select nik into new.employee_nik from public.ops_employees where upper(trim(tgrid))=new.tgrid;
  end if;
  return new;
end $$;
create or replace function public.ops_courier_sync_hierarchy()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  -- Leader records in the monthly workbook also list themselves; do not self-parent.
  if new.employee_nik is not null and new.leader_nik is not null and new.employee_nik<>new.leader_nik and new.active then
    update public.ops_employees set superior_nik=new.leader_nik
      where nik=new.employee_nik and position ~* '(kurir|rider|driver)'
      and superior_nik is distinct from new.leader_nik;
  end if;
  return new;
end $$;
create or replace trigger ops_courier_leader_link before insert or update on public.ops_courier_master
for each row execute function public.ops_courier_leader_link();
create or replace trigger ops_courier_sync_hierarchy after insert or update on public.ops_courier_master
for each row execute function public.ops_courier_sync_hierarchy();

-- Backfill links and align courier placement to the latest operational master.
update public.ops_courier_master set leader_nik=public.ops_resolve_superior_nik(leader)
where trim(leader)<>'';
-- Invalidate any preview made before this migration's master changes.
update public.ops_courier_master_revision set revision=revision+1 where singleton;
commit;
