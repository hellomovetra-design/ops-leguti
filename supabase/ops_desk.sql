-- Isolated OPS Desk feature tables. This migration does not alter existing OPS LEGUT tables.
create table if not exists public.ops_employees (
  nik text primary key, name text not null, position text not null, dept text, hub text,
  level text, superior text, employment text, start_date text, tgrid text,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.ops_users (
  id uuid primary key default gen_random_uuid(), email text not null unique,
  role text not null default 'pending' check (role in ('pending','leader','admin','spv','jr_spv')),
  leader_name text, created_at timestamptz not null default now()
);
create table if not exists public.ops_requests (
  id uuid primary key default gen_random_uuid(), type text not null, status text not null default 'pending' check (status in ('pending','approved','rejected','sent')),
  user_id text, name text not null, nik text not null, department text, location text, reason text not null,
  email_to text, email_subject text, email_body text, approved_by text, approved_at timestamptz, sent_at timestamptz, created_at timestamptz not null default now()
);
alter table public.ops_requests enable row level security;
create table if not exists public.ops_cases (
  id uuid primary key default gen_random_uuid(), awb text not null, leader text, zone text,
  consignee text, address text, goods text, service text, weight text, sla text, value text,
  category text, status text not null default 'open' check (status in ('open','closed')),
  last_seen timestamptz not null default now(), created_at timestamptz not null default now(), closed_at timestamptz
);
create unique index if not exists ops_cases_open_awb on public.ops_cases(awb) where status = 'open';
create table if not exists public.ops_comments (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.ops_cases(id) on delete cascade,
  author_id uuid, author_name text not null, body text not null, created_at timestamptz not null default now()
);
create table if not exists public.ops_problems (
  id uuid primary key default gen_random_uuid(), awb text not null, category text not null,
  description text, location text, division text, status text not null default 'open', created_by uuid, created_at timestamptz not null default now()
);
create index if not exists ops_problems_awb on public.ops_problems(awb);
create table if not exists public.ops_problem_photos (
  id uuid primary key default gen_random_uuid(), problem_id uuid not null references public.ops_problems(id) on delete cascade,
  storage_path text not null, file_name text, content_type text, created_at timestamptz not null default now()
);
insert into storage.buckets (id, name, public) values ('ops-problem-photos', 'ops-problem-photos', false) on conflict (id) do nothing;
alter table public.ops_employees enable row level security;
alter table public.ops_users enable row level security;
alter table public.ops_cases enable row level security;
alter table public.ops_comments enable row level security;
alter table public.ops_problems enable row level security;
