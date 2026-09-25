-- JNE Ops Insight - PostgreSQL schema for Supabase
create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin', 'viewer');
create type public.address_category as enum ('OFFICE', 'RESIDENCE', 'UNKNOWN');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'viewer',
  can_download boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_path text,
  report_date date,
  row_count integer not null default 0,
  valid_count integer not null default 0,
  duplicate_count integer not null default 0,
  status text not null default 'processing' check (status in ('processing','processed','failed')),
  error_message text,
  uploaded_by uuid references public.users(id),
  uploaded_at timestamptz not null default now()
);

create table public.raw_reports (
  id bigint generated always as identity primary key,
  upload_id uuid not null references public.uploads(id) on delete cascade,
  awb text not null,
  report_date date not null,
  original_row jsonb not null,
  created_at timestamptz not null default now(),
  unique (awb, report_date)
);

create table public.master_couriers (
  id uuid primary key default gen_random_uuid(),
  courier_id text not null,
  courier_name text not null,
  leader text,
  shift_kerja text,
  vehicle text,
  area text,
  kecamatan text,
  zone text,
  kanit text,
  kode text,
  kpi numeric,
  status_masuk text,
  effective_month date not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.users(id),
  unique (courier_id, effective_month)
);
create index master_courier_month_idx on public.master_couriers (courier_id, effective_month desc);

create table public.address_learning_rules (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  normalized_pattern text not null,
  category public.address_category not null,
  confidence numeric(5,2) not null default 100,
  source_address text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  is_active boolean not null default true,
  unique (normalized_pattern)
);

create table public.processed_reports (
  id bigint generated always as identity primary key,
  raw_report_id bigint not null references public.raw_reports(id) on delete cascade,
  upload_id uuid not null references public.uploads(id) on delete cascade,
  awb text not null,
  report_date date not null,
  shipper_name text,
  receiver_name text,
  full_address text,
  address_category public.address_category not null default 'UNKNOWN',
  address_category_manual boolean not null default false,
  inbound_manifest_date timestamptz,
  inbound_hour smallint check (inbound_hour between 0 and 23),
  inbound_category text,
  first_courier_id text,
  first_courier_name text,
  first_leader text,
  first_area text,
  first_zone text,
  last_courier_id text,
  last_courier_name text,
  last_leader text,
  last_area text,
  last_zone text,
  courier_changed boolean not null default false,
  date_first_attempt timestamptz,
  result_first_attempt text,
  date_last_attempt timestamptz,
  result_last_attempt text,
  status_pod text,
  failed_to_success boolean not null default false,
  aging_inbound_to_first numeric,
  aging_first_to_last numeric,
  aging numeric,
  sla text,
  processed_at timestamptz not null default now(),
  unique (awb, report_date)
);
create index processed_filter_idx on public.processed_reports (report_date, status_pod, address_category, last_area, last_zone);
create index processed_inbound_idx on public.processed_reports (inbound_manifest_date, inbound_category);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique default encode(gen_random_bytes(12), 'hex'),
  name text not null,
  created_by uuid not null references public.users(id),
  is_public boolean not null default true,
  password_hash text,
  expires_at timestamptz,
  allow_download boolean not null default false,
  filters jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  view_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.uploads enable row level security;
alter table public.raw_reports enable row level security;
alter table public.processed_reports enable row level security;
alter table public.master_couriers enable row level security;
alter table public.address_learning_rules enable row level security;
alter table public.share_links enable row level security;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

create policy "users read own profile" on public.users for select using (id = auth.uid() or public.is_admin());
create policy "authenticated read reports" on public.processed_reports for select to authenticated using (true);
create policy "authenticated read couriers" on public.master_couriers for select to authenticated using (true);
create policy "admin manage uploads" on public.uploads for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manage raw" on public.raw_reports for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manage processed" on public.processed_reports for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manage couriers" on public.master_couriers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manage learning" on public.address_learning_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "owner manage shares" on public.share_links for all to authenticated using (created_by = auth.uid() or public.is_admin()) with check (created_by = auth.uid() or public.is_admin());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), 'viewer');
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
