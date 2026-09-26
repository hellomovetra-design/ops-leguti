-- Tahap 2: workflow data problem barang.
alter table public.ops_problems add column if not exists verified_by text;
alter table public.ops_problems add column if not exists verified_at timestamptz;
alter table public.ops_problems add column if not exists resolved_by text;
alter table public.ops_problems add column if not exists resolved_at timestamptz;
alter table public.ops_problems add column if not exists status_note text;
alter table public.ops_problems drop constraint if exists ops_problems_status_check;
alter table public.ops_problems add constraint ops_problems_status_check
  check (status in ('open','verified','in_progress','resolved','closed'));
