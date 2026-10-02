begin;
create table if not exists public.ops_push_subscriptions (
 id uuid primary key default gen_random_uuid(), recipient_email text not null,
 endpoint_hash text not null unique, endpoint text not null, p256dh text not null, auth text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists ops_push_subscriptions_recipient on public.ops_push_subscriptions(recipient_email);
create table if not exists public.ops_push_deliveries (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.ops_notifications(id) on delete cascade,
 subscription_id uuid not null references public.ops_push_subscriptions(id) on delete cascade,
 attempts integer not null default 0, locked_at timestamptz, sent_at timestamptz,
 next_attempt_at timestamptz not null default now(), last_error text,
 unique(notification_id,subscription_id)
);
create index if not exists ops_push_deliveries_pending on public.ops_push_deliveries(next_attempt_at) where sent_at is null;
alter table public.ops_push_subscriptions enable row level security;
alter table public.ops_push_deliveries enable row level security;
revoke all on public.ops_push_subscriptions,public.ops_push_deliveries from anon,authenticated;
grant all on public.ops_push_subscriptions,public.ops_push_deliveries to service_role;
create or replace function public.ops_enqueue_push() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.ops_push_deliveries(notification_id,subscription_id)
 select new.id,s.id from public.ops_push_subscriptions s where s.recipient_email=new.recipient_email;
 return new;
end $$;
revoke all on function public.ops_enqueue_push() from public,anon,authenticated;
drop trigger if exists ops_notifications_enqueue_push on public.ops_notifications;
create trigger ops_notifications_enqueue_push after insert on public.ops_notifications for each row execute function public.ops_enqueue_push();
create or replace function public.ops_claim_push_deliveries()
returns table(id uuid,notification_id uuid,subscription_id uuid,attempts integer,endpoint text,p256dh text,auth text,title text)
language sql security definer set search_path=public,pg_temp as $$
 with picked as (
 select d.id from public.ops_push_deliveries d join public.ops_notifications n on n.id=d.notification_id
 where d.sent_at is null and d.attempts<5 and d.next_attempt_at<=now()
 and (d.locked_at is null or d.locked_at<now()-interval '5 minutes')
 and n.created_at>now()-interval '24 hours'
 order by d.next_attempt_at limit 20 for update of d skip locked
 ), claimed as (
 update public.ops_push_deliveries d set locked_at=now(),attempts=d.attempts+1
 from picked where d.id=picked.id returning d.*
 ) select c.id,c.notification_id,c.subscription_id,c.attempts,s.endpoint,s.p256dh,s.auth,n.title
 from claimed c join public.ops_notifications n on n.id=c.notification_id
 join public.ops_push_subscriptions s on s.id=c.subscription_id and s.recipient_email=n.recipient_email;
$$;
revoke all on function public.ops_claim_push_deliveries() from public,anon,authenticated;
grant execute on function public.ops_claim_push_deliveries() to service_role;
commit;
