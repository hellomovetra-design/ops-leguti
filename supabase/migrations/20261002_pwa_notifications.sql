begin;
create table if not exists public.ops_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null check (recipient_email = lower(trim(recipient_email))),
  kind text not null default 'status_update',
  entity_type text not null,
  entity_id uuid not null,
  title text not null,
  body text not null,
  status text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists ops_notifications_recipient_time on public.ops_notifications(recipient_email, created_at desc, id desc);
create index if not exists ops_notifications_unread on public.ops_notifications(recipient_email) where read_at is null;
alter table public.ops_notifications enable row level security;
revoke all on public.ops_notifications from anon, authenticated;
grant all on public.ops_notifications to service_role;

-- Store the event in the same transaction as the status update, not in browser state.
create or replace function public.ops_notify_status_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare recipient text; heading text; summary text; reference text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if tg_table_name = 'ops_requests' then
    recipient := lower(trim(new.created_by));
    heading := case new.status when 'approved' then 'Request dikonfirmasi admin' when 'sent' then 'Request sedang diproses' when 'completed' then 'Request selesai' when 'rejected' then 'Request belum disetujui' else null end;
    reference := coalesce(nullif(new.user_id, ''), nullif(new.shipment_numbers, ''), 'Request Helpdesk');
    summary := case new.status when 'approved' then 'Admin telah menyetujui request Anda.' when 'sent' then 'Request Anda telah diteruskan untuk ditangani.' when 'completed' then 'Penanganan request Anda telah selesai.' when 'rejected' then coalesce(nullif(new.rejection_reason, ''), 'Lihat detail request untuk informasi lebih lanjut.') end;
  elsif tg_table_name = 'ops_problems' then
    recipient := lower(trim(new.created_by_email));
    heading := case new.status when 'verified' then 'Barang Problem terverifikasi' when 'in_progress' then 'Barang Problem diproses' when 'resolved' then 'Barang Problem selesai' when 'closed' then 'Laporan Barang Problem ditutup' else null end;
    reference := coalesce(nullif(new.awb, ''), 'Barang Problem');
    summary := coalesce(nullif(new.status_note, ''), 'Admin telah memperbarui status laporan Anda.');
  end if;
  if recipient is null or recipient = '' or heading is null then return new; end if;
  insert into public.ops_notifications(recipient_email,entity_type,entity_id,title,body,status)
    values(recipient,case when tg_table_name='ops_requests' then 'request' else 'problem' end,new.id,heading,left(reference,160)||' · '||left(summary,600),new.status);
  return new;
end $$;
revoke all on function public.ops_notify_status_change() from public, anon, authenticated;
drop trigger if exists ops_requests_notify_status on public.ops_requests;
create trigger ops_requests_notify_status after update of status on public.ops_requests for each row execute function public.ops_notify_status_change();
drop trigger if exists ops_problems_notify_status on public.ops_problems;
create trigger ops_problems_notify_status after update of status on public.ops_problems for each row execute function public.ops_notify_status_change();
commit;
