-- Apply through the project's Supabase SQL migration workflow before deploying.
create table if not exists public.ops_problem_solving_daily (
  id uuid primary key,
  title text not null check (length(trim(title)) between 1 and 160),
  category text not null check (category in ('Jaringan','Perangkat','Aplikasi','Operasional','Lainnya')),
  incident_date date not null,
  incident_time time without time zone not null,
  unit text not null check (length(trim(unit)) between 1 and 160),
  description text not null check (length(trim(description)) between 1 and 10000),
  solution text not null default '' check (length(solution) <= 10000),
  status text not null default 'open' check (status in ('open','in_progress','completed')),
  photos jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ops_daily_owner_created_idx on public.ops_problem_solving_daily (created_by, created_at desc);
create index if not exists ops_daily_created_idx on public.ops_problem_solving_daily (created_at desc);
alter table public.ops_problem_solving_daily enable row level security;
-- Session-cookie API authorizes access; only the service role accesses this table.
create or replace function public.ops_daily_set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists ops_daily_updated_at on public.ops_problem_solving_daily;
create trigger ops_daily_updated_at before update on public.ops_problem_solving_daily
for each row execute function public.ops_daily_set_updated_at();
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ops-daily-photos', 'ops-daily-photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
