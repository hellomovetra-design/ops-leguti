create table if not exists public.ops_requests (
  id uuid primary key default gen_random_uuid(), type text not null, status text not null default 'pending' check (status in ('pending','approved','rejected','sent')),
  user_id text, name text not null, nik text not null, department text, location text, reason text not null,
  email_to text, email_subject text, email_body text, approved_by text, approved_at timestamptz, sent_at timestamptz, created_at timestamptz not null default now()
);
alter table public.ops_requests enable row level security;
