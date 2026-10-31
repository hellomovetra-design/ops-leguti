begin;
create table if not exists public.ops_mfa_login_challenges (
 id uuid primary key, user_id uuid not null, email text not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 factor_id uuid, attempts integer not null default 0, last_attempt_at timestamptz, consumed_at timestamptz
);
alter table public.ops_mfa_login_challenges add column if not exists last_attempt_at timestamptz;
create index if not exists ops_mfa_challenges_email_date on public.ops_mfa_login_challenges(email,created_at desc);
create index if not exists ops_mfa_challenges_expiry on public.ops_mfa_login_challenges(expires_at);
alter table public.ops_mfa_login_challenges enable row level security;
revoke all on public.ops_mfa_login_challenges from public,anon,authenticated;
grant select,insert,update,delete on public.ops_mfa_login_challenges to service_role;
create or replace function public.ops_claim_mfa_attempt(challenge uuid,account_email text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare entry public.ops_mfa_login_challenges; total integer;
begin
 delete from public.ops_mfa_login_challenges where expires_at<now()-interval '1 day';
 perform pg_advisory_xact_lock(hashtext(lower(account_email)));
 select * into entry from public.ops_mfa_login_challenges where id=challenge and email=lower(account_email) for update;
 if not found or entry.consumed_at is not null or entry.expires_at<=now() or entry.factor_id is null or entry.attempts>=5 then return false; end if;
 select coalesce(sum(attempts),0) into total from public.ops_mfa_login_challenges where email=lower(account_email) and last_attempt_at>now()-interval '15 minutes';
 if total>=10 then return false; end if;
 update public.ops_mfa_login_challenges set attempts=attempts+1,last_attempt_at=now() where id=challenge;
 return true;
end $$;
revoke all on function public.ops_claim_mfa_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.ops_claim_mfa_attempt(uuid,text) to service_role;
-- Operational data is accessed through authenticated application APIs only.
-- Prevent an AAL1 Supabase token from going around the dashboard's MFA gate.
do $$
declare item record;
begin
 for item in select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and left(c.relname,4)='ops_' and c.relkind in ('r','p','v','m') loop
  if item.relkind in ('r','p') then execute format('alter table public.%I enable row level security',item.relname); end if;
  execute format('revoke all on public.%I from public,anon,authenticated',item.relname);
  -- Preserve existing service_role grants, including append-only audit tables.
 end loop;
 for item in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and left(p.proname,4)='ops_' and p.prokind='f' loop
  execute format('revoke all on function %s from public,anon,authenticated',item.signature);
  execute format('grant execute on function %s to service_role',item.signature);
 end loop;
end $$;
commit;
