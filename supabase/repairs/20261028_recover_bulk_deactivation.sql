-- One incident only: 84-row upload on 28 October 2026, audit ID verified read-only.
-- Restore only proven active -> inactive status-only changes in these 3 transactions.
-- Never activate everyone marked Nonaktif. Abort if any affected record changed later.
begin;
do $$
declare candidates integer; restored integer;
begin
 perform 1 from public.ops_courier_master_revision where singleton for update;
 if not found then raise exception 'Master kurir belum siap.'; end if;
 if not exists(select 1 from public.ops_audit_logs
   where id='8f5f3f65-bb02-41d1-83bc-0624ada6eba2'::uuid
     and action='bulk_upsert' and entity_type='employee' and metadata->>'rows'='84'
     and created_at between '2026-10-28 03:55:17+00' and '2026-10-28 03:55:22+00') then
  raise exception 'Bukti upload tidak sesuai. Tidak ada data yang dipulihkan.';
 end if;
 create temporary table recovery_bulk_candidates on commit drop as
 select h.id,h.employee_nik,h.before_data
 from public.ops_personnel_changes h join public.ops_employees e on e.nik=h.employee_nik
 where h.transaction_id in (36405,36406,36407) and h.action='update'
   and h.created_at between '2026-10-28 03:55:17+00' and '2026-10-28 03:55:20+00'
   and h.before_data->>'active'='true' and h.after_data->>'active'='false'
   and h.after_data->>'employment'='Nonaktif'
   and (h.before_data-'active'-'employment')=(h.after_data-'active'-'employment')
   and not exists(select 1 from jsonb_each(h.after_data) f
     where to_jsonb(e)->f.key is distinct from f.value)
   and not exists(select 1 from public.ops_personnel_changes later
     where later.employee_nik=h.employee_nik and later.created_at>h.created_at);
 select count(*) into candidates from recovery_bulk_candidates;
 if candidates<>221 or (select count(distinct employee_nik) from recovery_bulk_candidates)<>221 then
  raise exception 'Ditemukan % kandidat, seharusnya 221. Data sudah berubah; audit ulang sebelum pemulihan.',candidates;
 end if;
 update public.ops_employees e set active=(r.before_data->>'active')::boolean,
   employment=r.before_data->>'employment'
 from recovery_bulk_candidates r where e.nik=r.employee_nik;
 get diagnostics restored=row_count;
 if restored<>221 then raise exception 'Jumlah pemulihan tidak sesuai; seluruh pemulihan dibatalkan.'; end if;
 raise notice '221 status karyawan dipulihkan sesuai riwayat; status nonaktif lainnya tidak diubah.';
end $$;
commit;
select count(*) filter(where active) as aktif,
 count(*) filter(where not active) as tidak_aktif,
 count(*) as total_data from public.ops_employees;
