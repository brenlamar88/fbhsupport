# FBH Support — Airtable to Neon PostgreSQL

**Status (October 21, 2026):** Preview API and EmailJS tested; historical data copied and validated in Neon. **Vercel production remains on Airtable** (main SHA `0fc829b17ddff9e00cde96d92afb80de0fc9b388`). Do not merge PR #37 or switch traffic until the final sync, release checks and explicit approval.

## Why this migration matters
Current static HTML pages contain browser-accessible Airtable credentials; admin authentication is client-only. Treat the old Airtable personal access token and admin password as compromised, and **revoke/rotate them** at cutover. Git history continues to contain old values. Review/rotate any exposed Anthropic API key and ntfy topic as appropriate.

## Architecture
- Existing static pages hosted on Vercel with no UI rebuild.
- Vercel Node.js functions: public create; authenticated read, update, soft delete and reports; server-side optional assignment emails and minimal-data push.
- Neon PostgreSQL schema in `sql/001_ticket_schema.sql`, plus legacy CSV fields in `sql/002_legacy_csv_columns.sql`.
- Admin login uses a scrypt password hash and signed HttpOnly session cookie. Per-user SSO would be better long-term.

## Prerequisites and privacy
1. **The owner confirmed these tickets contain no PHI. Keep that restriction enforced and revisit compliance if use changes.** Do not use Neon Free, generic Resend, ntfy or external AI to process PHI without verified eligibility, appropriate agreements and safeguards.
2. Take a backup of Airtable records, attachments, automations and linked data; do not commit exports to GitHub.
3. Confirm this repository deploys to the right Vercel project, preview deployments have protected access, and Vercel is configured with a Node.js runtime.
4. Neon project and schema exist. Neon `main` is production-bound and holds the 685 historical tickets; preview holds those 685 plus one synthetic QA ticket. A separate read-only launch-candidate snapshot was also verified.
5. Private **Vercel production variables are configured**. Review all scopes before cutover:
   - DATABASE_URL: Neon connection URL (SSL).
   - ADMIN_PASSWORD_HASH, SESSION_SECRET and RATE_LIMIT_SECRET: distinct secure production values configured in Vercel. Production password is different from preview; rotate the chat-shared value after cutover.
   - EMAILJS_PUBLIC_KEY and EMAILJS_PRIVATE_KEY: required for your existing EmailJS assignment template; configure privately in Vercel and enable non-browser API requests in EmailJS. Existing service/template IDs are specified in .env.example.
   - NTFY_TOPIC and NTFY_TOKEN: optional. Topic must be private.
   - ENABLE_AI_TRIAGE defaults to false; ANTHROPIC_API_KEY is required if enabled. Even ticket subjects may contain sensitive data.
6. Legacy Airtable credentials still exist in the old Vercel production environment to keep the live app operating. Treat the exposed token as compromised and rotate/revoke as part of the controlled final cutover; do not expose it again.

## Import, final sync and release gates

- **Completed:** Original user-exported `Tickets-All.csv` had exactly **685 historical rows**, all 21 columns structurally valid and 685 distinct numeric ticket numbers. Neon preview and production-bound main each have 685 unchanged historical records, including the full source JSON. A computed raw-data fingerprint matched between the two branches. **No synthetic QA ticket is in Neon main.**
- **Completed:** Preview ticket creation succeeded via the actual Vercel API, and nine authenticated end-to-end API checks passed: pagination (686 preview records over three pages), historical reference IDs, 60 review statuses, date-range report data, PATCH status, PATCH assignee, rejection of invalid assignee, notification suppression in preview, and restoration of the synthetic ticket.
- **Completed:** Eight unit tests and Node API syntax checks passed in an isolated environment. EmailJS provider returned HTTP 200 and the user confirmed actual delivery to `brennan@fusepros.com`.
- **Pending:** Visual admin-browser smoke test, sign-out/re-authentication confirmation, recovery/rollback rehearsal, production first-run smoke test.
- **Pending:** **Fresh, complete Airtable CSV export on cutover day.** Last source-export ticket submitted on 2026-10-19; the date of any later ticket or edits is unknown. Airtable's API reported a monthly quota error, so live synchronization through its API is unavailable. Do not assume the historical 685-ticket export is final.

### Final synchronization procedure (no production traffic switch yet)

1. Announce a short maintenance window, pause/freeze Airtable ticket submissions and admin edits, and verify no one can add or change a ticket during the export/switch.
2. Export the full Airtable ticket table as a fresh CSV covering **all records**, not just new/active tickets. Save that raw export privately as the final rollback/source audit file (not in Git).
3. Compare the fresh CSV to the 685-record snapshot by **numeric Ticket ID**, identify added/modified/deleted records and preserve all source columns. Existing migrated primary keys use `legacy_<numeric ID>` (not the inaccessible Airtable internal record IDs). Resolve conflicts manually if a record changed after initial import. Preserve original unusual status strings in `legacy_source_raw`, with `Needs Review` displayed for the 60 previously identified URL-valued statuses.
4. Import the verified delta into Neon preview **then Neon main** while the old site remains frozen. Use idempotent inserts/updates keyed to the numeric source ID only during this pre-cutover window. Validate final count, unique IDs, key fields, status distribution and a sample of modified records. Do **not** replay Airtable snapshots after Neon begins receiving live writes.
5. Capture an independent Neon point-in-time backup/snapshot, document a restore verification, and note the exact last-known-good old Vercel deployment. Account for the fact that the old browser-exposed Airtable token must ultimately be rotated; reverting the Vercel code alone will not guarantee a working rollback once the token is revoked.
6. With explicit go-live authorization, merge PR #37 and deploy. Verify HTTPS, admin login, ticket creation, EmailJS delivery, PATCH, report, and CSV export on the live URL. Monitor errors, then remove obsolete Airtable env vars, rotate exposed tokens/passwords and disable old Airtable automations in a coordinated sequence.
7. If rollback is needed, **stop accepting writes first**. Preserve/export tickets written to Neon during the cutover interval and reconcile them into the restored flow before re-enabling legacy ticket submissions. Never perform blind dual writes or silently discard new tickets.

## Behavior changes
- Admin auth is server-side; sessions expire after 8 hours.
- Direct browser calls to Airtable, Anthropic, ntfy and EmailJS are removed.
- Assignee emails continue through EmailJS's REST API using your existing template when server-side EmailJS keys are configured.
- Requester confirmation had previously been unconfigured and stays disabled until separately implemented.
- Delete is a soft-delete (auditable/recoverable in PostgreSQL).
- New ticket IDs are PostgreSQL-generated; imported numeric Ticket IDs are preserved as `legacy_ticket_number` and displayed as the user-facing reference, while imported primary keys use `legacy_<Ticket ID>`.
- AI triage is off until external processing is approved.

## Remaining go-live requirements

- Fresh Airtable CSV delta reconciliation and short write-freeze window.
- Verify admin browser UI workflows and rehearsed rollback/restore, including any Neon-only writes.
- Review the 60 unusual `Needs Review` records and 14 historically resolved tickets without resolution dates; original raw values remain preserved.
- Explicit authorization to deploy the production code. Until then PR #37 remains draft and production continues on Airtable.
- After cutover, remove old browser-exposed Airtable integration and rotate compromised credentials; monitor the Vercel runtime logs and support-ticket submission success rate.
