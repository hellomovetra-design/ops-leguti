-- Requires 20261030_coaching_workflow.sql.
begin;
alter table public.ops_employee_sanctions add column if not exists sanction_details jsonb;
alter table public.ops_employee_sanctions add column if not exists approver_one_signed boolean not null default false,
 add column if not exists approver_two_signed boolean not null default false;
alter table public.ops_employee_sanctions drop constraint if exists ops_sanction_details_object;
alter table public.ops_employee_sanctions add constraint ops_sanction_details_object
 check(sanction_details is null or jsonb_typeof(sanction_details)='object');
-- Additional protection for the newly added field during the HRD/final stages.
create or replace function public.ops_sanction_form_lock() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.kind<>'coaching' and new.workflow_status in ('sent_hrd','final') and (not new.approver_one_signed or not new.approver_two_signed) then
  raise exception 'Tanda tangan Atasan Terkait 1 dan 2 wajib dikonfirmasi.';
 end if;
 if new.workflow_status='awaiting_signatures' and (new.approver_one_signed or new.approver_two_signed) then raise exception 'Dokumen masih menunggu tanda tangan.'; end if;
 if tg_op='INSERT' then return new; end if;
 if old.workflow_status in ('sent_hrd','final') and new.sanction_details is distinct from old.sanction_details then
  raise exception 'Form sanksi yang sudah dikirim ke HRD/final tidak dapat diubah.';
 end if;
 return new;
end $$;
revoke all on function public.ops_sanction_form_lock() from public,anon,authenticated;
drop trigger if exists ops_sanction_form_lock on public.ops_employee_sanctions;
create trigger ops_sanction_form_lock before insert or update on public.ops_employee_sanctions
 for each row execute function public.ops_sanction_form_lock();
commit;
