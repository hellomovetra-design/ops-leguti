# Initial data-access hardening — 20 October 2026

Implemented locally:

- Employee source workbook moved from `public/` to `assets/templates/employee-structure.xlsx`. HR export retrieves it through the authenticated, dashboard-role-only `employees&view=template` API. Production file tracing explicitly includes the private workbook.
- Employee listing, summary, structure, template and export reject PWA-only viewers before database access. Overview also requires a dashboard role. Unknown GET types no longer fall through to cases.
- Private problem-photo access requires a registered photo and, for viewers, ownership of its report. Viewer profile-photo access is limited to the account's own photo. Explicit public evidence-token sharing is unchanged.

Verification: `npx tsc --noEmit`, `tests/security-data-access.cjs`, `tests/employee-summary-export.cjs`, `tests/employee-full-export-api.cjs`, `tests/live-role-access.cjs`.

Deployment follow-up: these changes do not close the live exposure until deployed. Retire/protect older Vercel deployments that still contain the public workbook; copying a file to a private location in a new deployment does not remove older deployments or external copies. Review repository visibility and historical copies separately. No assumption is made that previously public data was downloaded.

Not yet implemented: server-side session revocation on password reset, session/device management, durable distributed login throttling, and MFA enforced by the application's login/session flow. Supabase production policies, account configuration and logs still require a separate read-only review. This is not a full security certification.
