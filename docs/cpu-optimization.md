# CPU budget changes — 25 October 2026

Observed in Vercel: Fluid Active CPU 4h 7m against a 4h allowance; memory 290.8/360 GB-hours and transfer 2.84/100 GB. The team's 30-day CPU breakdown attributed usage to ops-leguti. Endpoint ranking available during inspection covered only the most recent 12 hours, not the whole billing period.

Changes:

- Retire inbox SSE server connections. The legacy authenticated endpoint returns HTTP 204, instructing old EventSource clients not to reconnect. New clients share one 60-second refresh clock per inbox audience and browser tab, with no parallel 20-second timers.
- Inbox may display incoming messages up to roughly 60 seconds later while visible. Sending still updates the sender's UI immediately. Existing background Web Push stays independent and unchanged. No Supabase service-role credentials are moved into browser code.
- PWA and admin notifications refresh every two minutes instead of 15 seconds.
- Employee summaries, daily reports, queues, and scheduled operational lists refresh every five minutes. Opening a menu, changing filters or saving still triggers the relevant existing load/update path.
- PWA fetches module-specific histories only in their relevant menus or the unified activity screen. Home still loads the histories required to preserve its counts and recent-activity cards. OTS is not loaded on Home. Profile has a separate 15-minute refresh, rather than being reloaded alongside every module.
- `visiblePoll` skips hidden/offline tabs, resumes on focus/visibility/online after a cooldown, prevents overlap within each polling task and removes its timer/listeners on unmount. Existing authenticated account/role checks are unchanged.

This reduces scheduled request frequency, not a guaranteed percentage of CPU usage. Compare CPU and memory usage per active-user-hour after deployment and normal traffic resumes. Old JS tabs should be reloaded. These changes do not automatically lift Vercel's existing account pause or change billing/plan settings.

Checks: `tests/cpu-refresh.cjs`, PWA history, inbox API, notifications API, report workflow, TypeScript and production build.
