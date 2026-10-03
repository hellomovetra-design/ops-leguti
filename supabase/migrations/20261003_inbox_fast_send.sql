-- Apply after 20261003_request_inbox.sql. One network round trip per send.
begin;
create or replace function public.ops_inbox_send_fast(p_thread uuid,p_email text,p_admin boolean,p_body text,p_client uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from ops_inbox_threads where id=p_thread and (p_admin or owner_email=p_email)) then
    raise exception 'Inbox not found' using errcode='P0002';
  end if;
  return ops_inbox_send(p_thread,p_email,ops_inbox_account_name(p_email),p_admin,p_body,p_client);
end $$;
revoke all on function public.ops_inbox_send_fast(uuid,text,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.ops_inbox_send_fast(uuid,text,boolean,text,uuid) to service_role;
commit;
