# Sanksi & Coaching

## Activation

Run `supabase/migrations/20261027_employee_sanctions.sql` in the existing project's Supabase SQL Editor before deploying. The migration adds private tables, constraints and audit triggers; it does not add records for real employees. Re-running is safe. No employee sanctions are created automatically.

## Access

- PWA recording allows Super Admin without an employee link. All other users require a linked, active employee whose database position is Leader, Coordinator/Koordinator, Supervisor/SPV or Jr. Supervisor/JR SPV. Merely having an admin/SPV/JR SPV account role is insufficient. This is checked on the server on every request, not inferred from a user-supplied role/NIK. SPC is a hub name and does not grant access.
- The employee selector follows descendants in the employee hierarchy using `superior_nik`; legacy name relationships work only when the parent name is unique. Inactive employees and self-selection are excluded for structural users; Super Admin can choose all active employees. PWA history is limited to records created by the logged-in account, including Super Admin; no global history or employee-facing notifications are exposed.
- Dashboard recording, global recap and corrections require Super Admin, Admin Pengelola or SPV. Corrections preserve the original identity/superior snapshot and require the current record version. Direct API access by other roles is denied.
- There is no public evidence/share endpoint, export, automatic escalation, password change or deletion for this sensitive module. Decisions and wording remain manual responsibilities of authorized staff.

## Fields and behavior

Choices: Coaching, Surat Teguran (ST), SP 1, SP 2, SP 3 and Tindak lanjut HC/GA. HC/GA is labeled as referral/follow-up, not a sanction level. Name, NIK, job, hub and superior are obtained from employee data. Date, description and coaching result are entered manually. Coaching result is required for Coaching. The recap has the requested identity, sanction/follow-up, description and coaching-result columns.

Each form has a stable UUID; retry after a lost response does not create another row. The server rejects impersonated employee data, out-of-scope subjects, invalid dates and oversized descriptions. Before/after records are retained by a private trigger-backed audit table. Stale edits produce a conflict instead of overwriting newer work.

The PWA icon supplied by the user is copied unchanged to `public/pwa-sanctions.png`. For eligible users, the compact services row is four columns: Barang Problem, Request Helpdesk, Sanksi, Problem Solving Daily. Other staff keep the three permitted service tiles. The feature mounts only when opened, uses a five-minute visible/offline-aware poll, and is excluded from the public/global activity feed.

## Checks

`node tests/employee-sanctions-api.cjs`

`node tests/employee-sanctions-db.cjs "D:/DASBOARD ADMIN LEGUTI/.tmp/report-workflow-validation/node_modules/@electric-sql/pglite"`

The database test runs in an isolated in-memory database, not production. Additional regression tests cover existing permissions, PWA history scoping and CPU refresh behavior. A production build checks routes and TypeScript. Live browser visual QA is pending when browser access is disabled in Work settings.
