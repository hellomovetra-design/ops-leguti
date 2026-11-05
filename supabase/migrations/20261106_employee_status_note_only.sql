begin;

create or replace function public.ops_save_employee_with_status_history(
  p_employee jsonb, p_create boolean, p_actor text, p_detail jsonb
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  target_nik text := trim(p_employee->>'nik');
  original_nik text := coalesce(nullif(trim(p_employee->>'original_nik'),''),target_nik);
  previous public.ops_employees;
  previous_status text;
  next_status text := p_employee->>'employment';
  reason text;
  note text := trim(p_detail->>'note');
  replacement_nik text := nullif(trim(p_detail->>'replacement_nik'),'');
  replacement_name text;
  result jsonb;
begin
  -- Match the lock order of employee and courier saves.
  perform 1 from public.ops_courier_master_revision where singleton for update;
  select * into previous from public.ops_employees where nik=original_nik for update;
  previous_status := case
    when lower(trim(previous.employment)) ~ '^resign(ed)?([[:space:]]*/[[:space:]]*belum[[:space:]]+(ada[[:space:]]+)?(pengganti|diganti))?$' then 'Resign'
    when previous.active is false or lower(trim(previous.employment)) in ('nonaktif','non aktif','inactive') then 'Nonaktif'
    else 'Aktif'
  end;

  if next_status in ('Resign','Nonaktif') and (p_create or next_status <> previous_status) then
    reason := case when next_status='Resign' then 'resign' else p_detail->>'reason' end;
    if reason is null or reason not in ('resign','replacement','transfer','other')
       or (next_status='Nonaktif' and reason='resign') then
      raise exception 'Pilih alasan nonaktif.';
    end if;
    if coalesce(note,'')='' or length(note)>500 then
      raise exception 'Isi keterangan perubahan status (maksimal 500 karakter).';
    end if;
    if reason='replacement' and replacement_nik is not null then
      select name into replacement_name from public.ops_employees
        where nik=replacement_nik and nik not in (original_nik,target_nik) and active;
      if not found then raise exception 'Pilih karyawan pengganti yang aktif.'; end if;
    else
      replacement_nik := null;
    end if;
  end if;

  result := public.ops_save_employee_and_courier(p_employee,p_create,p_actor);
  if reason is not null then
    update public.ops_personnel_changes
      set after_data=after_data || jsonb_strip_nulls(jsonb_build_object(
        'status_reason',reason,'status_note',note,
        'replacement_nik',replacement_nik,'replacement_name',replacement_name
      )), actor_email=coalesce(nullif(trim(p_actor),''),actor_email)
      where transaction_id=txid_current() and employee_nik=target_nik and after_data is not null;
    if not found then raise exception 'Riwayat perubahan status gagal dicatat.'; end if;
  end if;
  return result;
end $$;

revoke all on function public.ops_save_employee_with_status_history(jsonb,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.ops_save_employee_with_status_history(jsonb,boolean,text,jsonb) to service_role;
commit;
