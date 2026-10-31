# Initial data-access hardening — 20 October 2026

Implemented locally:

- Employee source workbook moved from `public/` to `assets/templates/employee-structure.xlsx`. HR export retrieves it through the authenticated, dashboard-role-only `employees&view=template` API. Production file tracing explicitly includes the private workbook.
- Employee listing, summary, structure, template and export reject PWA-only viewers before database access. Overview also requires a dashboard role. Unknown GET types no longer fall through to cases.
- Private problem-photo access requires a registered photo and, for viewers, ownership of its report. Viewer profile-photo access is limited to the account's own photo. Explicit public evidence-token sharing is unchanged.

Verification: `npx tsc --noEmit`, `tests/security-data-access.cjs`, `tests/employee-summary-export.cjs`, `tests/employee-full-export-api.cjs`, `tests/live-role-access.cjs`.

Deployment follow-up: these changes do not close the live exposure until deployed. Retire/protect older Vercel deployments that still contain the public workbook; copying a file to a private location in a new deployment does not remove older deployments or external copies. Review repository visibility and historical copies separately. No assumption is made that previously public data was downloaded.

Not yet implemented: server-side session revocation on password reset, session/device management, durable distributed password-login throttling. MFA rollout now has a dedicated implementation and activation guide in `docs/dashboard-mfa.md`. A limited read-only production TOTP/RLS review is recorded in that guide; a complete production configuration and incident-log review remains outside this check. This is not a full security certification.
