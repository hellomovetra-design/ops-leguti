begin;
-- Notify dashboard managers of subsequent messages without duplicating the
-- existing new-request notice. Message retry does not insert a second row.
create or replace function public.ops_notify_admin_inbox_message() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare thread public.ops_inbox_threads;
begin
 if new.sender_role<>'user' or new.kind='request' then return new; end if;
 select * into thread from public.ops_inbox_threads where id=new.thread_id;
 if not found then return new; end if;
 insert into public.ops_notifications(recipient_email,kind,entity_type,entity_id,title,body,status,thread_id,destination)
 select distinct lower(trim(u.email)),'inbox_request',thread.entity_type,thread.entity_id,
  'Pesan baru dari '||coalesce(nullif(new.sender_name,''),'Pengguna'),left(new.body,180),thread.status,thread.id,
  '/dashboard/ops-desk/inbox?thread='||thread.id
 from public.ops_users u where u.role in ('super_admin','admin','spv') and lower(trim(u.email))<>lower(new.sender_email);
 return new;
end $$;
revoke all on function public.ops_notify_admin_inbox_message() from public,anon,authenticated;
drop trigger if exists ops_notify_admin_inbox_message on public.ops_inbox_messages;
create trigger ops_notify_admin_inbox_message after insert on public.ops_inbox_messages
for each row execute function public.ops_notify_admin_inbox_message();
commit;
