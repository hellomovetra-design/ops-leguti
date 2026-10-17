# Employee supervisors and live courier sync

Apply `supabase/migrations/20261017_employee_courier_live_sync.sql` before deploying the UI change. It requires the existing NIK hierarchy, contacts/identity, courier-master and employment-type migrations. Run the entire SQL transaction.

- Add/edit employee now uses a searchable supervisor picker (name, NIK, role, hub), restricted to active leaders/coordinators/SPV and excluding the employee. The selected NIK is saved with the canonical database name. Typing without selecting a result does not enable Save. “Tanpa atasan” explicitly clears the relation.
- Existing unresolved/inactive supervisors are displayed as stored information, without silently guessing another person's identity.
- The existing employment wrapper is retained; the core edit RPC accepts an explicit `superior_nik`. Contact edits, NIK correction, employment type and TGR aliases remain supported.
- A deferred employee trigger synchronizes final transaction state to courier master after manual, bulk or SQL writes. This avoids interfering with existing multi-statement imports. Master revision locking uses the same order as courier imports. No-op/contact-only writes do not add master revisions.
- Couriers with a valid TGR ID get a linked master row. Active/inactive state and name follow main employee data. Leader names are refreshed by supervisor NIK; coordinator/SPV assignments do not preserve a stale delivery leader. Existing area, shift, vehicle, district, zone, Kanit and other operational fields are preserved.
- A courier without TGR ID is not assigned an invented ID. New master rows may still need operational placement fields completed. No placement data is inferred from another person.
- The migration reconciles existing records; ambiguous TGR identity conflicts are skipped with a SQL notice and left for review. No fuzzy/name-only linking or deletion takes place.
- The Master Kurir page refreshes when focused again. Each download fetches current database state. Inactive couriers are excluded. All active rows are included even if operational fields are incomplete; missing values remain blank and the page shows a non-blocking reminder. Operational validation for manual/bulk placement updates is unchanged.

Tests: `node tests/employee-live-sync.cjs` uses isolated PGlite with actual installed migrations, `node tests/employee-edit.cjs`, `node tests/courier-master-api.cjs`, and `node tests/person-picker.cjs`. PGlite is a temporary test dependency under `.tmp/report-workflow-validation` (see `docs/report-workflow.md`); no application dependencies changed.
