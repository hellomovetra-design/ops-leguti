-- Riwayat request: pencarian AWB CL3, detail operasional, dan arsip.
alter table public.ops_requests add column if not exists shipment_numbers text;
alter table public.ops_requests add column if not exists archived_at timestamptz;
alter table public.ops_requests add column if not exists archived_by text;
alter table public.ops_requests add column if not exists last_action_at timestamptz;
create index if not exists ops_requests_shipment_numbers on public.ops_requests(shipment_numbers);
create index if not exists ops_requests_created_at on public.ops_requests(created_at desc);
alter table public.ops_requests drop constraint if exists ops_requests_status_check;
alter table public.ops_requests add constraint ops_requests_status_check
  check (status in ('pending','approved','rejected','sent','completed','deleted'));
