begin;
create table if not exists public.ops_evidence_shares (
  kind text not null check (kind in ('damage','problem','barkur')),
  record_id uuid not null,
  token text not null unique check (token ~ '^[a-f0-9]{64}$'),
  created_by text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (kind, record_id)
);
alter table public.ops_evidence_shares enable row level security;
revoke all on public.ops_evidence_shares from anon, authenticated;
grant all on public.ops_evidence_shares to service_role;
commit;
