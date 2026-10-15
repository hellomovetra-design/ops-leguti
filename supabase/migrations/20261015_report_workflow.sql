-- Run after notifications, web push, inbox, damage and BARKUR migrations.
begin;
create table if not exists public.ops_report_history (
 id uuid primary key default gen_random_uuid(),
 entity_type text not null check(entity_type in ('damage','problem','barkur')),
 entity_id uuid not null,
 action text not null check(action in ('create','update')),
 actor_email text,
 old_status text, new_status text not null,
 old_note text, new_note text,
 created_at timestamptz not null default clock_timestamp()
);
create index if not exists ops_report_history_record on public.ops_report_history(entity_type,entity_id,created_at,id);
alter table public.ops_report_history enable row level security;
revoke all on public.ops_report_history from public,anon,authenticated;
revoke all on public.ops_report_history from service_role;
grant select,insert on public.ops_report_history to service_role;

-- A non-unique index preserves historical duplicate rows. The trigger prevents new ones.
create index if not exists ops_damage_awb_key on public.ops_damage_cases(upper(regexp_replace(awb,'\s','','g')));
create index if not exists ops_problem_awb_key on public.ops_problems(upper(regexp_replace(awb,'\s','','g')));
create index if not exists ops_barkur_awb_key on public.ops_barkur(upper(regexp_replace(awb,'\s','','g')));
create index if not exists ops_damage_pending on public.ops_damage_cases(created_at,id) where status in ('open','in_progress');
create index if not exists ops_problem_pending on public.ops_problems(created_at,id) where status in ('open','verified','in_progress');
create index if not exists ops_barkur_pending on public.ops_barkur(created_at,id) where status in ('open','investigating');
create or replace function public.ops_report_awb_exists(p_kind text,p_awb text,p_exclude uuid default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare target text; found_awb boolean;
begin
 target:=case p_kind when 'damage' then 'ops_damage_cases' when 'problem' then 'ops_problems' when 'barkur' then 'ops_barkur' else null end;
 if target is null then raise exception 'Invalid module'; end if;
 execute format('select exists(select 1 from public.%I where upper(regexp_replace(awb,''\s'','''',''g''))=upper(regexp_replace($1,''\s'','''',''g'')) and ($2 is null or id<>$2))',target)
 into found_awb using p_awb,p_exclude;
 return found_awb;
end $$;
revoke all on function public.ops_report_awb_exists(text,text,uuid) from public,anon,authenticated;
grant execute on function public.ops_report_awb_exists(text,text,uuid) to service_role;
create or replace function public.ops_guard_report_awb() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare key text; duplicate_found boolean;
begin
 key:=upper(regexp_replace(new.awb,'\s','','g'));
 if tg_op='UPDATE' and key=upper(regexp_replace(old.awb,'\s','','g')) then return new; end if;
 -- Serialize the same module/AWB, including two simultaneous uploads.
 perform pg_advisory_xact_lock(hashtextextended(tg_table_name||':'||key,0));
 execute format('select exists(select 1 from public.%I where upper(regexp_replace(awb,''\s'','''',''g''))=$1 and id<>$2)',tg_table_name)
 into duplicate_found using key,new.id;
 if duplicate_found then raise exception 'AWB_DUPLICATE' using errcode='23505'; end if;
 return new;
end $$;
revoke all on function public.ops_guard_report_awb() from public,anon,authenticated;

create or replace function public.ops_record_report_event() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare report_kind text; label text; event_destination text; actor text; owner text; before_row jsonb; after_row jsonb;
 old_note text; new_note text; claims jsonb;
begin
 after_row:=to_jsonb(new);
 if tg_op='UPDATE' then before_row:=to_jsonb(old); end if;
 report_kind:=case tg_table_name when 'ops_damage_cases' then 'damage' when 'ops_problems' then 'problem' else 'barkur' end;
 label:=case report_kind when 'damage' then 'Damage Case' when 'problem' then 'Barang Problem' else 'BARKUR' end;
 new_note:=coalesce(after_row->>'resolution',after_row->>'status_note','');
 old_note:=coalesce(before_row->>'resolution',before_row->>'status_note','');
 claims:=coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}');
 if claims->>'role'='service_role' then
  actor:=nullif(trim(coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}')->>'x-ops-actor'),'');
 end if;
 if tg_op='INSERT' or (before_row->>'status',old_note) is distinct from (after_row->>'status',new_note) then
  insert into public.ops_report_history(entity_type,entity_id,action,actor_email,old_status,new_status,old_note,new_note)
  values(report_kind,new.id,case tg_op when 'INSERT' then 'create' else 'update' end,actor,before_row->>'status',new.status,old_note,new_note);
 end if;
 if tg_op='INSERT' then
  owner:=lower(trim(coalesce(after_row->>'created_by_email',after_row->>'created_by','')));
  event_destination:=case report_kind when 'damage' then '/dashboard/ops-desk/damage-cases' when 'problem' then '/dashboard/ops-desk/problems' else '/dashboard/ops-desk/ots' end||'?id='||new.id;
  insert into public.ops_notifications(recipient_email,kind,entity_type,entity_id,title,body,status,destination)
  select distinct lower(trim(u.email)),'report_new',report_kind,new.id,label||' baru','Ada laporan baru yang perlu ditangani.',new.status,event_destination
  from public.ops_users u where u.role in ('super_admin','admin','spv')
  and coalesce((to_jsonb(u)->>'is_active')::boolean,true) and lower(trim(u.email))<>owner
  -- Existing Problem inbox trigger already notifies some administrators.
  and not exists(select 1 from public.ops_notifications n where n.entity_type=report_kind and n.entity_id=new.id and n.recipient_email=lower(trim(u.email)));
 elsif report_kind='damage' and new.status is distinct from old.status then
  insert into public.ops_notifications(recipient_email,kind,entity_type,entity_id,title,body,status,destination)
  values(lower(trim(new.created_by)),'status_update',report_kind,new.id,'Status Damage Case diperbarui','Admin telah memperbarui laporan Anda.',new.status,'/pwa?damage='||new.id);
 end if;
 return new;
end $$;
revoke all on function public.ops_record_report_event() from public,anon,authenticated;
drop trigger if exists ops_guard_report_awb on public.ops_damage_cases;
create trigger ops_guard_report_awb before insert or update of awb on public.ops_damage_cases for each row execute function public.ops_guard_report_awb();
drop trigger if exists ops_guard_report_awb on public.ops_problems;
create trigger ops_guard_report_awb before insert or update of awb on public.ops_problems for each row execute function public.ops_guard_report_awb();
drop trigger if exists ops_guard_report_awb on public.ops_barkur;
create trigger ops_guard_report_awb before insert or update of awb on public.ops_barkur for each row execute function public.ops_guard_report_awb();
-- z-prefix runs after existing inbox triggers; no duplicate notices for the same recipient.
drop trigger if exists z_ops_report_event on public.ops_damage_cases;
create trigger z_ops_report_event after insert or update on public.ops_damage_cases for each row execute function public.ops_record_report_event();
drop trigger if exists z_ops_report_event on public.ops_problems;
create trigger z_ops_report_event after insert or update on public.ops_problems for each row execute function public.ops_record_report_event();
drop trigger if exists z_ops_report_event on public.ops_barkur;
create trigger z_ops_report_event after insert or update on public.ops_barkur for each row execute function public.ops_record_report_event();
-- Problem row and photo metadata commit together. Stable IDs support safe PWA retries.
create or replace function public.ops_create_problem_report(p_id uuid,p_values jsonb,p_photos jsonb,p_actor text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.ops_problems; photo jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('problem-id:'||p_id::text,0));
 select * into result from public.ops_problems where id=p_id;
 if found then
  if lower(result.created_by_email)<>lower(trim(p_actor)) then raise exception 'Report ID already used'; end if;
  return to_jsonb(result)||jsonb_build_object('_reused',true);
 end if;
 if jsonb_typeof(p_photos)<>'array' or jsonb_array_length(p_photos)>3 then raise exception 'Invalid photos'; end if;
 insert into public.ops_problems(id,awb,category,description,location,division,created_by_email)
 values(p_id,p_values->>'awb',p_values->>'category',p_values->>'description',p_values->>'location',p_values->>'division',lower(trim(p_actor))) returning * into result;
 for photo in select value from jsonb_array_elements(p_photos) loop
  insert into public.ops_problem_photos(problem_id,storage_path,file_name,content_type)
  values(p_id,photo->>'storage_path',photo->>'file_name',photo->>'content_type');
 end loop;
 return to_jsonb(result)||jsonb_build_object('_reused',false);
end $$;
revoke all on function public.ops_create_problem_report(uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.ops_create_problem_report(uuid,jsonb,jsonb,text) to service_role;
commit;
-- History starts when this migration is applied. No fabricated history or old notification flood.
