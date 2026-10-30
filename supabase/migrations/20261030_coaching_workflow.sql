begin;
alter table public.ops_employee_sanctions
 add column if not exists coaching_details jsonb,
 add column if not exists recorder_nik text,
 add column if not exists recorder_name text not null default '',
 add column if not exists workflow_status text not null default 'awaiting_signatures',
 add column if not exists sent_hrd_at timestamptz,
 add column if not exists sent_hrd_by text,
 add column if not exists employee_signed boolean not null default false,
 add column if not exists coach_signed boolean not null default false,
 add column if not exists final_document jsonb,
 add column if not exists finalized_at timestamptz,
 add column if not exists finalized_by text,
 add column if not exists hrd_signed boolean not null default false;
alter table public.ops_employee_sanctions add column if not exists workflow_request_id uuid;
-- No fabricated names, signatures, dates, or final files on historical records.
create or replace function public.ops_sanction_document_guard() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if new.workflow_status not in ('awaiting_signatures','sent_hrd','final') then raise exception 'Status dokumen tidak valid.'; end if;
 if tg_op='INSERT' then
  if new.workflow_status<>'awaiting_signatures' or new.final_document is not null or new.sent_hrd_at is not null
    or new.finalized_at is not null or new.employee_signed or new.coach_signed or new.hrd_signed then raise exception 'Catatan baru harus menunggu tanda tangan.'; end if;
 else
  if old.workflow_status='final' then raise exception 'Dokumen final sudah dikunci.'; end if;
  -- Recorder identity is a snapshot, not whichever administrator edits the record.
  if old.recorder_name<>'' then new.recorder_name:=old.recorder_name;new.recorder_nik:=old.recorder_nik;end if;
  if old.workflow_status='sent_hrd' then
   if new.workflow_status<>'final' then raise exception 'Dokumen sudah di HRD dan hanya dapat difinalkan.'; end if;
   if (new.kind,new.coaching_details,new.description,new.coaching_result,new.incident_date,new.photos)
     is distinct from (old.kind,old.coaching_details,old.description,old.coaching_result,old.incident_date,old.photos) then raise exception 'Isi dokumen yang sudah dikirim ke HRD tidak boleh diubah.'; end if;
   new.sent_hrd_at:=old.sent_hrd_at;new.sent_hrd_by:=old.sent_hrd_by;
  elsif new.workflow_status='final' then raise exception 'Dokumen harus dikirim ke HRD terlebih dahulu.';
  end if;
 end if;
 if new.workflow_status='awaiting_signatures' then
  if new.final_document is not null or new.sent_hrd_at is not null or new.finalized_at is not null
    or new.employee_signed or new.coach_signed or new.hrd_signed then raise exception 'Tanda tangan belum dikonfirmasi.'; end if;
 end if;
 if new.workflow_status in ('sent_hrd','final') then
  if not new.employee_signed or not new.coach_signed or new.sent_hrd_at is null or coalesce(new.sent_hrd_by,'')='' then raise exception 'Tanda tangan karyawan dan atasan wajib dikonfirmasi.'; end if;
 end if;
 if new.workflow_status='sent_hrd' and (new.final_document is not null or new.hrd_signed or new.finalized_at is not null) then raise exception 'Finalisasi belum lengkap.'; end if;
 if new.workflow_status='final' then
  if not new.hrd_signed or new.finalized_at is null or coalesce(new.finalized_by,'')='' or new.final_document is null
    or jsonb_typeof(new.final_document)<>'object' or coalesce(new.final_document->>'path','')='' then raise exception 'Unggah scan bertanda tangan HRD untuk finalisasi.'; end if;
 end if;
 if new.coaching_details is not null and jsonb_typeof(new.coaching_details)<>'object' then raise exception 'Form coaching tidak valid.'; end if;
 return new;
end $$;
revoke all on function public.ops_sanction_document_guard() from public,anon,authenticated;
drop trigger if exists ops_sanction_document_guard on public.ops_employee_sanctions;
create trigger ops_sanction_document_guard before insert or update on public.ops_employee_sanctions
 for each row execute function public.ops_sanction_document_guard();
create index if not exists ops_sanctions_workflow on public.ops_employee_sanctions(workflow_status,created_at desc);
commit;
