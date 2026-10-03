-- Apply after employee-login, PWA notifications, and web-push migrations.
begin;

create table if not exists public.ops_inbox_threads (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('request','problem')),
  entity_id uuid not null,
  owner_email text not null check (owner_email = lower(trim(owner_email))),
  owner_name text not null,
  subject text not null,
  reference text not null default '',
  summary text not null default '',
  status text not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_body text not null default 'Request baru dikirim',
  first_admin_email text,
  first_admin_name text,
  unique(entity_type,entity_id)
);
create table if not exists public.ops_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  thread_id uuid not null references public.ops_inbox_threads(id) on delete cascade,
  sender_email text not null check (sender_email = lower(trim(sender_email))),
  sender_name text not null,
  sender_role text not null check (sender_role in ('user','admin')),
  kind text not null default 'message' check (kind in ('request','message')),
  body text not null check (length(trim(body)) between 1 and 2000),
  client_id uuid,
  created_at timestamptz not null default now(),
  unique(thread_id,sender_email,client_id)
);
create table if not exists public.ops_inbox_reads (
  thread_id uuid not null references public.ops_inbox_threads(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  last_read_seq bigint not null default 0,
  primary key(thread_id,email)
);
create index if not exists ops_inbox_owner_time on public.ops_inbox_threads(owner_email,last_message_at desc,id desc);
create index if not exists ops_inbox_time on public.ops_inbox_threads(last_message_at desc,id desc);
create index if not exists ops_inbox_message_thread_seq on public.ops_inbox_messages(thread_id,seq desc);
alter table public.ops_inbox_threads enable row level security;
alter table public.ops_inbox_messages enable row level security;
alter table public.ops_inbox_reads enable row level security;
revoke all on public.ops_inbox_threads,public.ops_inbox_messages,public.ops_inbox_reads from anon,authenticated;
grant all on public.ops_inbox_threads,public.ops_inbox_messages,public.ops_inbox_reads to service_role;
grant usage,select on sequence public.ops_inbox_messages_seq_seq to service_role;

alter table public.ops_notifications add column if not exists destination text;
alter table public.ops_notifications add column if not exists thread_id uuid references public.ops_inbox_threads(id) on delete set null;

create or replace function public.ops_inbox_account_name(p_email text) returns text
language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(
    (select nullif(trim(e.name),'') from ops_user_employee_links l join ops_employees e on e.nik=l.employee_nik where l.email=p_email),
    (select nullif(trim(display_name),'') from ops_user_profiles where email=p_email),
    nullif(split_part(p_email,'@',1),''),'Pengguna'
  );
$$;

-- Both the request and its Inbox are committed in the same transaction.
create or replace function public.ops_inbox_capture_request() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner text; heading text; ref text; summary text; thread uuid; actor_name text;
begin
  if tg_table_name='ops_requests' then
    owner := lower(trim(new.created_by));
    heading := case when new.type='open_cl3' then 'Open Status CL3' else 'Aktivasi User TGR' end;
    ref := coalesce(nullif(new.user_id,''),nullif(new.shipment_numbers,''),'');
    summary := coalesce(nullif(new.reason,''),'Request Helpdesk');
  else
    owner := lower(trim(new.created_by_email));
    heading := 'Barang Problem'; ref := coalesce(new.awb,'');
    summary := coalesce(nullif(new.description,''),'Laporan Barang Problem');
  end if;
  if owner is null or owner='' then return new; end if;
  actor_name := ops_inbox_account_name(owner);
  insert into ops_inbox_threads(entity_type,entity_id,owner_email,owner_name,subject,reference,summary,status,created_at,last_message_at)
    values(case when tg_table_name='ops_requests' then 'request' else 'problem' end,new.id,owner,actor_name,heading,ref,summary,new.status,new.created_at,new.created_at)
    on conflict(entity_type,entity_id) do nothing returning id into thread;
  if thread is null then return new; end if;
  insert into ops_inbox_messages(thread_id,sender_email,sender_name,sender_role,kind,body,created_at)
    values(thread,owner,actor_name,'user','request',left(summary,2000),new.created_at);
  -- Admin desktops receive only NEW requests/problems, not subsequent user chat.
  insert into ops_notifications(recipient_email,kind,entity_type,entity_id,title,body,status,thread_id,destination)
    select distinct lower(trim(u.email)),'inbox_request',case when tg_table_name='ops_requests' then 'request' else 'problem' end,new.id,
      'Request baru dari '||actor_name,heading,new.status,thread,'/dashboard/ops-desk/inbox?thread='||thread
    from ops_users u where u.role in ('super_admin','admin') and lower(trim(u.email))<>owner;
  return new;
end $$;

-- Backfill existing history quietly: do not send a burst of old notifications.
insert into ops_inbox_threads(entity_type,entity_id,owner_email,owner_name,subject,reference,summary,status,created_at,last_message_at)
  select 'request',r.id,lower(trim(r.created_by)),ops_inbox_account_name(lower(trim(r.created_by))),
    case when r.type='open_cl3' then 'Open Status CL3' else 'Aktivasi User TGR' end,
    coalesce(nullif(r.user_id,''),r.shipment_numbers,''),coalesce(nullif(r.reason,''),'Request Helpdesk'),r.status,r.created_at,r.created_at
  from ops_requests r where nullif(trim(r.created_by),'') is not null
  on conflict(entity_type,entity_id) do nothing;
insert into ops_inbox_threads(entity_type,entity_id,owner_email,owner_name,subject,reference,summary,status,created_at,last_message_at)
  select 'problem',p.id,lower(trim(p.created_by_email)),ops_inbox_account_name(lower(trim(p.created_by_email))),
    'Barang Problem',coalesce(p.awb,''),coalesce(nullif(p.description,''),'Laporan Barang Problem'),p.status,p.created_at,p.created_at
  from ops_problems p where nullif(trim(p.created_by_email),'') is not null
  on conflict(entity_type,entity_id) do nothing;
insert into ops_inbox_messages(thread_id,sender_email,sender_name,sender_role,kind,body,created_at)
  select t.id,t.owner_email,t.owner_name,'user','request',left(t.summary,2000),t.created_at from ops_inbox_threads t
  where not exists(select 1 from ops_inbox_messages m where m.thread_id=t.id);

drop trigger if exists ops_requests_inbox on ops_requests;
create trigger ops_requests_inbox after insert on ops_requests for each row execute function ops_inbox_capture_request();
drop trigger if exists ops_problems_inbox on ops_problems;
create trigger ops_problems_inbox after insert on ops_problems for each row execute function ops_inbox_capture_request();

create or replace function public.ops_inbox_sync_status() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update ops_inbox_threads set status=new.status where entity_id=new.id and entity_type=case when tg_table_name='ops_requests' then 'request' else 'problem' end;
  return new;
end $$;
drop trigger if exists ops_requests_inbox_status on ops_requests;
create trigger ops_requests_inbox_status after update of status on ops_requests for each row execute function ops_inbox_sync_status();
drop trigger if exists ops_problems_inbox_status on ops_problems;
create trigger ops_problems_inbox_status after update of status on ops_problems for each row execute function ops_inbox_sync_status();

create or replace function public.ops_inbox_list(p_email text,p_admin boolean,p_offset integer default 0) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  with visible as (
    select t.*, (select count(*) from ops_inbox_messages m where m.thread_id=t.id and m.sender_email<>p_email
      and m.seq>coalesce((select last_read_seq from ops_inbox_reads r where r.thread_id=t.id and r.email=p_email),0)) as unread
    from ops_inbox_threads t where p_admin or t.owner_email=p_email
  ), page as (
    select * from visible order by last_message_at desc,id desc limit 51 offset p_offset
  ), items as (select * from page order by last_message_at desc,id desc limit 50)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i) order by last_message_at desc,id desc) from items i),'[]'::jsonb),
    'has_more',(select count(*) from page)>50,'unread',coalesce((select sum(unread) from visible),0));
$$;

-- Serialize replies on the thread: the FIRST admin name cannot be overwritten
-- by simultaneous replies. Client ids make network retries idempotent.
create or replace function public.ops_inbox_send(p_thread uuid,p_email text,p_name text,p_admin boolean,p_body text,p_client uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t ops_inbox_threads; m ops_inbox_messages;
begin
  select * into t from ops_inbox_threads where id=p_thread for update;
  if t.id is null or (not p_admin and t.owner_email<>p_email) then raise exception 'Inbox not found'; end if;
  if p_client is null or length(trim(p_body)) not between 1 and 2000 then raise exception 'Invalid message'; end if;
  select * into m from ops_inbox_messages where thread_id=p_thread and sender_email=p_email and client_id=p_client;
  if m.id is not null then return to_jsonb(m); end if;
  insert into ops_inbox_messages(thread_id,sender_email,sender_name,sender_role,body,client_id)
    values(p_thread,p_email,p_name,case when p_admin then 'admin' else 'user' end,trim(p_body),p_client) returning * into m;
  update ops_inbox_threads set last_body=m.body,last_message_at=m.created_at,
    first_admin_email=case when p_admin then coalesce(first_admin_email,p_email) else first_admin_email end,
    first_admin_name=case when p_admin then coalesce(first_admin_name,p_name) else first_admin_name end where id=p_thread;
  if p_admin and t.owner_email<>p_email then
    insert into ops_notifications(recipient_email,kind,entity_type,entity_id,title,body,status,thread_id,destination)
      values(t.owner_email,'inbox_reply',t.entity_type,t.entity_id,p_name||' membalas request kamu',left(m.body,180),t.status,p_thread,'/pwa?inbox='||p_thread);
  end if;
  return to_jsonb(m);
end $$;

create or replace function public.ops_inbox_mark_read(p_thread uuid,p_email text,p_seq bigint) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare safe_seq bigint; observed_at timestamptz;
begin
  select coalesce(max(seq),0) into safe_seq from ops_inbox_messages where thread_id=p_thread and seq<=p_seq;
  insert into ops_inbox_reads(thread_id,email,last_read_seq) values(p_thread,p_email,safe_seq)
    on conflict(thread_id,email) do update set last_read_seq=greatest(ops_inbox_reads.last_read_seq,excluded.last_read_seq);
  select created_at into observed_at from ops_inbox_messages where thread_id=p_thread and seq=safe_seq;
  update ops_notifications set read_at=now() where thread_id=p_thread and recipient_email=p_email
    and read_at is null and created_at<=observed_at;
end $$;

-- The existing push queue now includes a safe application deep link.
drop function if exists public.ops_claim_push_deliveries();
create function public.ops_claim_push_deliveries()
returns table(id uuid,notification_id uuid,subscription_id uuid,attempts integer,endpoint text,p256dh text,auth text,title text,destination text)
language sql security definer set search_path=public,pg_temp as $$
  with picked as (
    select d.id from ops_push_deliveries d join ops_notifications n on n.id=d.notification_id
    where d.sent_at is null and d.attempts<5 and d.next_attempt_at<=now()
      and (d.locked_at is null or d.locked_at<now()-interval '5 minutes') and n.created_at>now()-interval '24 hours'
    order by d.next_attempt_at limit 20 for update of d skip locked
  ), claimed as (
    update ops_push_deliveries d set locked_at=now(),attempts=d.attempts+1 from picked where d.id=picked.id returning d.*
  ) select c.id,c.notification_id,c.subscription_id,c.attempts,s.endpoint,s.p256dh,s.auth,n.title,n.destination
  from claimed c join ops_notifications n on n.id=c.notification_id
    join ops_push_subscriptions s on s.id=c.subscription_id and s.recipient_email=n.recipient_email;
$$;

revoke all on function public.ops_inbox_account_name(text),public.ops_inbox_capture_request(),public.ops_inbox_sync_status(),public.ops_inbox_list(text,boolean,integer),public.ops_inbox_send(uuid,text,text,boolean,text,uuid),public.ops_inbox_mark_read(uuid,text,bigint),public.ops_claim_push_deliveries() from public,anon,authenticated;
grant execute on function public.ops_inbox_account_name(text),public.ops_inbox_list(text,boolean,integer),public.ops_inbox_send(uuid,text,text,boolean,text,uuid),public.ops_inbox_mark_read(uuid,text,bigint),public.ops_claim_push_deliveries() to service_role;
commit;
