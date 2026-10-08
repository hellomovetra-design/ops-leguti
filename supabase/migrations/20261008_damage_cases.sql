begin;
create table if not exists public.ops_damage_cases (
  id uuid primary key,
  awb text not null check(length(trim(awb)) between 1 and 80),
  trip text not null check(length(trim(trip)) between 1 and 100),
  fleet text not null check(length(trim(fleet)) between 1 and 160),
  plate text not null check(length(trim(plate)) between 1 and 30),
  remark text not null check(length(trim(remark)) between 1 and 5000),
  photos jsonb not null check(jsonb_typeof(photos)='array' and jsonb_array_length(photos)=4),
  status text not null default 'open' check(status in ('open','in_progress','completed')),
  resolution text not null default '' check(length(resolution)<=5000),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status <> 'completed' or length(trim(resolution))>0)
);
create index if not exists ops_damage_cases_owner_idx on public.ops_damage_cases(created_by,created_at desc,id);
create index if not exists ops_damage_cases_created_idx on public.ops_damage_cases(created_at desc,id);
create index if not exists ops_damage_cases_awb_idx on public.ops_damage_cases(awb);
alter table public.ops_damage_cases enable row level security;
revoke all on public.ops_damage_cases from anon,authenticated;
grant all on public.ops_damage_cases to service_role;
create or replace function public.ops_damage_cases_timestamp() returns trigger language plpgsql set search_path=public as $$
begin
  new.created_by:=old.created_by;
  new.created_at:=old.created_at;
  new.photos:=old.photos;
  new.updated_at:=clock_timestamp();
  return new;
end;
$$;
drop trigger if exists ops_damage_cases_updated on public.ops_damage_cases;
create trigger ops_damage_cases_updated before update on public.ops_damage_cases for each row execute function public.ops_damage_cases_timestamp();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ops-damage-photos','ops-damage-photos',false,1048576,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
commit;
