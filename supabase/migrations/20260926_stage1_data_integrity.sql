-- Tahap 1: jejak penginput, audit aktivitas, dan metadata foto.
alter table public.ops_requests add column if not exists created_by text;
alter table public.ops_requests add column if not exists updated_at timestamptz not null default now();
alter table public.ops_problems add column if not exists created_by_email text;
alter table public.ops_problems add column if not exists updated_at timestamptz not null default now();

create table if not exists public.ops_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ops_audit_logs_created_at on public.ops_audit_logs(created_at desc);
create index if not exists ops_audit_logs_entity on public.ops_audit_logs(entity_type, entity_id);
alter table public.ops_audit_logs enable row level security;
