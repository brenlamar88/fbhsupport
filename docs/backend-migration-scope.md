# FBH Support Hub — Backend Migration Scope

**Purpose:** move the ticket system off "browser talks directly to Airtable" and behind a
small backend, to fix three real problems that are now biting:

1. **Rate limits (HTTP 429).** The form, admin dashboard, and reports all hit Airtable
   directly. Airtable allows ~5 requests/sec per base; exceeding it locks the base for ~30s,
   which is what made tickets fail to submit.
2. **Exposed secrets.** `admin.html` / `index.html` ship the Airtable token, the admin
   password, the EmailJS keys, and (if used) the Anthropic key to every browser. Anyone can
   View Source and get full read/write/delete on the ticket base.
3. **No real admin auth.** The admin "login" is a password compared in client-side JavaScript.

---

## Current architecture

- **Frontend:** two static pages on Vercel — `index.html` (public ticket form) and
  `admin.html` (dashboard). No build step.
- **Data:** Airtable base `appOQI2Im5XebeIyg`, table `tblEMz0BecYmu48y0`.
- **Side effects:** EmailJS (assignment + confirmation emails, from the browser), ntfy push
  (from the browser), auto-routing logic (in the browser), optional AI triage (Anthropic from
  the browser).
- **Ops layer:** Claude skills + the FBH Support Agent (unchanged by this migration).

---

## Goals / non-goals

**Goals**
- No secrets in the browser.
- No per-base rate-limit exposure (cache reads, funnel writes through one place).
- Real admin authentication.
- Keep every current feature working; keep the Airtable data where it is for Phase 1.

**Non-goals (for now)**
- Rebuilding the UI. The two pages stay; only their data calls change.
- Changing the Claude skills / Support Agent.

---

## Recommended approach: two phases

### Phase 1 — Vercel serverless proxy in front of Airtable  ✅ recommended first

Keep Airtable as the datastore. Add API routes to the **same Vercel project**, so the browser
never talks to Airtable (or EmailJS/ntfy/Anthropic) directly.

**New API endpoints (`/api/*`, Vercel Functions):**
- `POST /api/login` — checks the admin password against a server env var, sets a signed,
  http-only session cookie. The real password never reaches the browser.
- `GET  /api/tickets` — returns the list (with status/facility/tool filters). **Caches results
  server-side for ~30–60s** so repeated dashboard loads cost one Airtable call, not many →
  this is what ends the 429s.
- `POST /api/tickets` — creates a ticket. Runs **auto-routing, the assignment email, the
  requester confirmation, and the ntfy push server-side.** Public, but validated + lightly
  rate-limited per IP.
- `PATCH /api/tickets/:id` — status change / assignment (admin-only; sets Resolved Date).
- `DELETE /api/tickets/:id` — delete (admin-only).
- `GET  /api/report` — aggregates submitted/resolved/by-facility/by-tool server-side.
- `POST /api/triage` — AI triage summary (Anthropic key stays on the server).

**Secrets → Vercel Environment Variables** (never in the repo):
`AIRTABLE_TOKEN`, `ADMIN_PASSWORD` (or a hash), `SESSION_SECRET`, email provider key,
`NTFY_TOPIC`/token, `ANTHROPIC_KEY`.

**Frontend changes:** swap each direct `fetch(AIRTABLE…)` / `emailjs.send` / ntfy POST for a
call to the matching `/api/*` route. Delete the `CONFIG` secrets from both HTML files.

**Email:** two options — (a) keep EmailJS but call it from the function with the private key,
or (b) switch to a server mailer (**Resend**, or **M365 Graph** since you're already on M365)
for better deliverability and one less third-party. Recommendation: **M365 Graph or Resend.**

**What this buys us:** secrets off the client, rate-limit problem gone (cached reads + single
write path), real server-checked admin login — **with no data migration.** This is the
high-ROI, low-risk step.

**Effort:** Medium. Mostly new API routes + find-and-replace on the frontend fetches.

---

### Phase 2 — Move the datastore to Supabase (Postgres)  ◻ optional, later

Do this when you want to remove Airtable's limits entirely and get real multi-user auth.

- **Schema:** a `tickets` table (plus `team`, `routing` if you want them data-driven) in
  Supabase Postgres.
- **Auth:** Supabase Auth for admins — per-person logins and roles (you, Braden, etc.) instead
  of a shared password. Row-Level Security enforces who can see/do what.
- **Migration:** one-time script to copy existing Airtable rows into Postgres.
- **Side effects:** Supabase Edge Functions for routing/emails; a scheduled function (pg_cron)
  for the **daily AI triage digest** and **weekly report** emailed to you automatically —
  things a static page fundamentally can't do.
- **Frontend:** the `/api/*` contract from Phase 1 barely changes, so the pages mostly keep
  working; the functions just point at Postgres instead of Airtable.

**What this buys us:** no rate limits, real per-user auth + audit trail, and secure scheduled
automations. **Trade-off:** you'd manage ticket data in Supabase/the app instead of the
Airtable grid UI, plus a data migration.

**Effort:** Large (schema + auth + migration + function rewrites).

---

## Decisions needed before building

1. **Scope:** Phase 1 only (keep Airtable) for now, or commit to Phase 2 (Supabase) as the end
   state? *(Recommendation: do Phase 1 now; decide Phase 2 later.)*
2. **Email provider:** keep EmailJS, or move to **M365 Graph** / **Resend**?
   *(Recommendation: M365 Graph — you already own it.)*
3. **Admin auth:** shared password (server-checked) is fine for Phase 1; per-user logins come
   with Phase 2. OK to start with the shared password?
4. **Hosting/access:** confirm the Vercel project these functions deploy into, and that I can
   be given access (the Vercel + Supabase connectors each need you to authorize them in
   claude.ai before I can act on them).

---

## Risks & notes

- A Vercel function in front of Airtable still hits Airtable's limits *if uncached* — the
  server-side cache on `GET /api/tickets` is what matters, so it's required, not optional.
- The Airtable token must be stored as a Vercel env var with the right scopes — **not** in the
  repo or the HTML.
- **Cutover is reversible:** deploy the API, point a copy of the pages at it, test, then flip.
  If anything breaks, the current direct-to-Airtable pages still exist until we delete them.
- Connectors (Vercel, Supabase) are currently **unauthenticated in this session** — they need
  you to connect them in claude.ai before I can deploy or run migrations.

---

## Suggested sequence (Phase 1)

1. Stand up `/api/login` + session cookie; gate admin routes.
2. `GET /api/tickets` (cached) and `POST /api/tickets` (with routing + email + ntfy).
3. Point `admin.html` and `index.html` at the `/api/*` routes; remove all `CONFIG` secrets.
4. Move AI triage to `POST /api/triage`.
5. Set Vercel env vars; verify nothing sensitive remains in the HTML.
6. Test end-to-end (submit, list, assign, resolve, report, emails, push), then cut over.
