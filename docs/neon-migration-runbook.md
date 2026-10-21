# FBH Support — Airtable to Neon PostgreSQL

**Status: migration code prepared, NOT deployed.** Do not merge or switch the live app until the steps below pass. Current production keeps using Airtable.

## Why this migration matters
Current static HTML pages contain browser-accessible Airtable credentials; admin authentication is client-only. Treat the old Airtable personal access token and admin password as compromised, and **revoke/rotate them** at cutover. Git history continues to contain old values. Review/rotate any exposed Anthropic API key and ntfy topic as appropriate.

## Architecture
- Existing static pages hosted on Vercel with no UI rebuild.
- Vercel Node.js functions: public create; authenticated read, update, soft delete and reports; server-side optional assignment emails and minimal-data push.
- Neon PostgreSQL schema in sql/001_ticket_schema.sql.
- Admin login uses a scrypt password hash and signed HttpOnly session cookie. Per-user SSO would be better long-term.

## Prerequisites and privacy
1. **The owner confirmed these tickets contain no PHI. Keep that restriction enforced and revisit compliance if use changes.** Do not use Neon Free, generic Resend, ntfy or external AI to process PHI without verified eligibility, appropriate agreements and safeguards.
2. Take a backup of Airtable records, attachments, automations and linked data; do not commit exports to GitHub.
3. Confirm this repository deploys to the right Vercel project, preview deployments have protected access, and Vercel is configured with a Node.js runtime.
4. Create a Neon project and execute sql/001_ticket_schema.sql in Neon SQL Editor.
5. Run npm install; configure these private **Vercel environment variables**:
   - DATABASE_URL: Neon connection URL (SSL).
   - ADMIN_PASSWORD_HASH, SESSION_SECRET and RATE_LIMIT_SECRET: generate with node scripts/generate-secrets.mjs on your own machine.
   - EMAILJS_PUBLIC_KEY and EMAILJS_PRIVATE_KEY: required for your existing EmailJS assignment template; configure privately in Vercel and enable non-browser API requests in EmailJS. Existing service/template IDs are specified in .env.example.
   - NTFY_TOPIC and NTFY_TOKEN: optional. Topic must be private.
   - ENABLE_AI_TRIAGE defaults to false; ANTHROPIC_API_KEY is required if enabled. Even ticket subjects may contain sensitive data.
6. Do NOT put the old Airtable token into Vercel. It is only needed on a local trusted workstation during import.

## Import and verification
1. Restrict/pause new ticket writes for the final sync and deployment to avoid races.
2. Set AIRTABLE_TOKEN and DATABASE_URL in your local environment. Optional AIRTABLE_BASE_ID and AIRTABLE_TABLE_ID can override source identifiers. Never paste secrets into chat or Git.
3. Run node scripts/migrate-airtable.mjs to preview records without writes.
4. Run node scripts/migrate-airtable.mjs --write to import. The script preserves source IDs and is rerunnable **before cutover**. Do not run after PostgreSQL becomes authoritative; it can overwrite updated tickets.
5. Compare source/destination count, ticket IDs, example records, priorities, owners, statuses, dates and reports.
6. Test a protected Vercel preview: sign in/out, block unauthorized access, new tickets, automatic assignment and email, status updates, reassignment, soft delete, paginated listing, reports, CSV and optional AI.
7. Verify backups and test restore. Free managed plans can have limited restore history.
8. After approvals, promote to production, rotate the leaked credentials, disable Airtable automation and monitor. Preserve old database exports according to retention policy.

## Behavior changes
- Admin auth is server-side; sessions expire after 8 hours.
- Direct browser calls to Airtable, Anthropic, ntfy and EmailJS are removed.
- Assignee emails continue through EmailJS's REST API using your existing template when server-side EmailJS keys are configured.
- Requester confirmation had previously been unconfigured and stays disabled until separately implemented.
- Delete is a soft-delete (auditable/recoverable in PostgreSQL).
- New ticket IDs are PostgreSQL-generated; imported IDs remain the same and preserve the reference suffix.
- AI triage is off until external processing is approved.

## Still needed before production
- Verify EmailJS server API permissions, credentials, quotas and preview email delivery.
- Consider per-user admin login with Entra ID instead of the shared password.
- Add bot controls, operational alerts, tested restoration and full build/integration tests. No live deployment or real data import has been performed by this code change.
