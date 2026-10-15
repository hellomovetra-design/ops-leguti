# Report workflow — 15 October 2026

## Activation order

1. Apply `supabase/migrations/20261015_report_workflow.sql` in the existing Supabase SQL Editor. It requires the existing inbox, notifications, web-push, Problem, Damage and BARKUR tables/migrations. Run the entire transaction, not selected fragments.
2. Confirm SQL success, then deploy the application changes. Do not deploy the new Problem handler before the migration: it intentionally refuses unconfirmed/partial saves if its RPC is missing.
3. In the admin header, open the notification bell and enable device notifications with the user's consent. Existing subscriptions continue to work. Device push still requires the existing VAPID and service-role environment configuration.
4. Keep the existing authenticated `/api/push/dispatch` webhook/scheduler for queue retries and direct SQL-originated events. Normal application saves also schedule dispatch after the response. Never expose the dispatch secret in screenshots or client code.

## Behavior

- New Damage, Problem and BARKUR records notify Super Admin, Admin and SPV accounts (excluding the submitting account). Existing Problem inbox notifications are reused instead of duplicating the same notification for the same recipient.
- The new header bell lists the current account's notifications, independently from the Inbox message indicator. Opening a notice marks only that account's notice as read and follows an allowlisted internal URL.
- Main lists remain newest-first. A separate, global oldest-first queue shows the ten oldest unresolved reports per module, with the full unresolved count. Completed/resolved/closed cases are excluded. Age is based on report creation, not the last edit. Amber starts at three hours and red at 24 hours. These are reminders, not a contractual SLA or performance score.
- History records report creation and changes to status or follow-up notes atomically with the report. Actor identity comes only from a trusted service-role request header. Direct SQL without trusted actor context is unattributed. Historical events are not fabricated, and old reports do not cause a notification flood. Owners can read only their own history, with admin email addresses redacted; dashboard roles can read report history.
- Duplicate AWBs are matched within the same module, ignoring whitespace and case. Different modules may report the same AWB. The form warns early; server preflight avoids unnecessary uploads, and a database advisory-lock trigger guards concurrent inserts. Existing duplicate rows are preserved and remain editable. A different user does not receive another reporter's identity, photos, or record ID from the duplicate check.
- Damage and Problem PWA submissions show actual upload progress, then a separate waiting-for-server phase. No success is shown before the server confirms persistence. There is a two-minute response timeout, without automatic re-submission. Retrying reuses the same UUID and checks whether the original report committed.
- Problem report rows and photo metadata commit together in a database RPC. Upload failures do not create incomplete reports. A lost commit response is rechecked; potentially committed evidence is never deleted merely because a response was lost. Rare unconfirmed outcomes can retain unreferenced uploads for later reconciliation.
- PWA drafts, including compressed photos, are stored in IndexedDB on the current device, scoped to account email and module. They are restored for up to seven days. Successful saves clear drafts; explicit PWA logout clears draft storage. Clearing browser/site data, private browsing, blocked storage, or storage eviction can remove drafts. The UI warns if local storage is unavailable. Drafts are not a server backup and are not silently sent when connectivity returns.

## Verification without production writes

Temporary test-only dependencies (under ignored `.tmp`; no application dependency changes):

```powershell
npm install --prefix .tmp/report-workflow-validation --no-save --package-lock=false @electric-sql/pglite fake-indexeddb react-test-renderer@19.0.0 react@19.0.0
node tests/report-workflow-sql.cjs
node tests/report-drafts.cjs
node tests/report-workflow.cjs
node tests/create-problem-report.cjs
node tests/damage-cases.cjs
node tests/barkur-api.cjs
node tests/notifications-api.cjs
node tests/web-push.cjs
npm run build
```

The SQL test runs the actual migration in isolated PostgreSQL, including re-application, atomic rollback, legacy duplicate preservation, actor attribution, owner status notifications and notification deduplication. The draft test uses the real React hook with IndexedDB emulation. HTTP/browser-delivery tests do not send real push notifications.
