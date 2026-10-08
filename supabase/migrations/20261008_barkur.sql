begin;
create table if not exists public.ops_barkur (
  id uuid primary key,
  awb text not null check(length(trim(awb)) between 1 and 80),
  bag_number text not null check(length(trim(bag_number)) between 1 and 100),
  origin text not null check(length(trim(origin)) between 1 and 160),
  destination text not null check(length(trim(destination)) between 1 and 160),
  incident_at timestamptz not null,
  email_sent_at timestamptz check(email_sent_at is null or email_sent_at >= incident_at),
  pic text not null check(length(trim(pic)) between 1 and 160),
  description text not null default '' check(length(description)<=10000),
  status text not null default 'open' check(status in ('open','investigating','completed')),
  resolution text not null default '' check(length(resolution)<=10000),
  evidence_link text not null default '',
  evidence jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence)<=3),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status <> 'completed' or length(trim(resolution))>0)
);
create index if not exists ops_barkur_incident_idx on public.ops_barkur(incident_at desc,id);
create index if not exists ops_barkur_awb_idx on public.ops_barkur(awb);
create index if not exists ops_barkur_status_idx on public.ops_barkur(status,incident_at desc);
alter table public.ops_barkur enable row level security;
revoke all on public.ops_barkur from anon,authenticated;
grant all on public.ops_barkur to service_role;
create or replace function public.ops_barkur_timestamp() returns trigger language plpgsql set search_path=public as $$
begin
  new.created_at:=old.created_at;
  new.created_by:=old.created_by;
  new.updated_at:=now();
  return new;
end;
$$;
drop trigger if exists ops_barkur_updated on public.ops_barkur;
create trigger ops_barkur_updated before update on public.ops_barkur for each row execute function public.ops_barkur_timestamp();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ops-barkur-evidence','ops-barkur-evidence',false,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
commit;
