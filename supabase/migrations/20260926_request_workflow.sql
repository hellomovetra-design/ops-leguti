-- Tahap 2: workflow request helpdesk.
alter table public.ops_requests add column if not exists rejected_by text;
alter table public.ops_requests add column if not exists rejected_at timestamptz;
alter table public.ops_requests add column if not exists rejection_reason text;
alter table public.ops_requests add column if not exists completed_by text;
alter table public.ops_requests add column if not exists completed_at timestamptz;
alter table public.ops_requests drop constraint if exists ops_requests_status_check;
alter table public.ops_requests add constraint ops_requests_status_check
  check (status in ('pending','approved','rejected','sent','completed'));
