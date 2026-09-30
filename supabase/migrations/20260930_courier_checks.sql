-- Bawaan Kurir / Form Pemeriksaan Connote. Apply before enabling the feature.
create table if not exists public.ops_courier_checks (
  id uuid primary key,
  inspection_date date not null,
  delivery_area text not null check (length(trim(delivery_area)) between 1 and 160),
  inspector_name text not null check (length(trim(inspector_name)) between 1 and 160),
  courier_id text not null,
  courier_name text not null,
  position text not null check (position in ('Rider','Driver')),
  employment text not null check (length(trim(employment)) between 1 and 160),
  runsheet_count integer not null check (runsheet_count between 0 and 1000000),
  physical_count integer not null check (physical_count between 0 and 1000000),
  result text not null check (result in ('Sesuai','Tidak Sesuai')),
  documentation_url text not null default '',
  inspection_location text not null check (length(trim(inspection_location)) between 1 and 160),
  inspection_time time without time zone not null,
  notes text not null default '' check (length(notes) <= 10000),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  created_by text not null, updated_by text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists ops_courier_checks_date_idx on public.ops_courier_checks (inspection_date desc, created_at desc);
create index if not exists ops_courier_checks_owner_idx on public.ops_courier_checks (created_by, created_at desc);
alter table public.ops_courier_checks enable row level security;
-- Cookie-authenticated API controls ownership. No anonymous/browser table access.
create or replace function public.ops_courier_checks_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists ops_courier_checks_updated on public.ops_courier_checks;
create trigger ops_courier_checks_updated before update on public.ops_courier_checks
for each row execute function public.ops_courier_checks_touch();
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ops-courier-photos', 'ops-courier-photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
