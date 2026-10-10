begin;
-- Source: MASTER DATA DAMGE CASE.xlsx, 'origin warehouse'!B4:B20.
create table if not exists public.ops_damage_warehouse_master (
  name text not null check (length(name) between 1 and 100),
  name_key text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint ops_damage_warehouse_name_key check (name_key = regexp_replace(upper(name), '[^A-Z0-9]', '', 'g'))
);
alter table public.ops_damage_warehouse_master enable row level security;
revoke all on public.ops_damage_warehouse_master from public, anon, authenticated;
grant all on public.ops_damage_warehouse_master to service_role;
insert into public.ops_damage_warehouse_master(name,name_key)
select name,regexp_replace(upper(name),'[^A-Z0-9]','','g') from (values
  ('ARGO PANTES'), ('BANDUNG'), ('BEKASI'), ('BOGOR'), ('CIKARANG'),
  ('CIPONDOH'), ('CIREBON'), ('DEPOK'), ('INB AKASIA'), ('KEDAUNG'),
  ('MEGA HUB'), ('OTB AKASIA'), ('OTB BANMAS BLOK J'), ('OTB BITUNG'),
  ('OTB DADAP'), ('OTB LEGUTI'), ('PURI MANSION')
) as source(name)
on conflict(name_key) do nothing;
commit;
select count(*) as warehouse_aktif from public.ops_damage_warehouse_master where active;
