create table if not exists public.ops_user_profiles (
  email text primary key,
  display_name text,
  photo_path text,
  updated_at timestamptz not null default now()
);
alter table public.ops_user_profiles enable row level security;
insert into storage.buckets (id, name, public)
values ('ops-profile-photos', 'ops-profile-photos', false)
on conflict (id) do nothing;
