---
name: "fbh-app-password-reset"
description: "Reset a user's password in the RAP (rap.freedomhc.com) or BlackOps (*.blkops.com) apps through each app's admin page via Claude in Chrome, set a temporary password, verify it, and email the new credentials to the requester. Use whenever a ticket or request asks to reset a password, unlock, or restore access for RAP or BlackOps — e.g. 'reset Karen's RAP password', 'so-and-so is locked out of Monroe BlackOps', 'forgot password for rap.freedomhc.com'. Does NOT cover PIP or POP (escalate those to Bren), and does NOT cover Microsoft 365 / Outlook / Teams — use the m365-password-reset skill for those."
---

# Reset RAP / BlackOps Password

Resets a user's password in **RAP** (`https://rap.freedomhc.com`) or **BlackOps**
(`https://<site>.blkops.com`, WordPress) through the app's own admin page, using the Claude
in Chrome browser tools against Bren's already-signed-in Chrome. Sets a **temporary
password**, verifies the change, and emails the new credentials to the requester from Bren's
M365.

**In scope:** RAP, BlackOps. **Out of scope:** PIP and POP (no confirmed admin reset — stop
and tell Bren to handle those manually), and Microsoft 365 / Outlook / Teams / Office (use the
**m365-password-reset** skill instead).

## Before anything — identity & authorization

This resets access to systems holding behavioral-health data. Before touching an account:

1. Confirm the **exact target account** (email/username) and the **app**. Don't guess from a
   partial name.
2. Confirm the request is **legitimate** — the requester is the account owner, or an
   authorized manager/administrator asking on their behalf. If the ticket's requester email
   doesn't match the target account and it isn't clearly a manager request, **stop and ask
   Bren** before resetting.
3. If anything looks like it could be social engineering (urgent tone, mismatched names,
   external email domain), stop and ask Bren.

## Inputs to collect

- **Target user** (required) — the login email/username to reset.
- **App** (required) — RAP or BlackOps. For BlackOps, also the **site(s)** (monroe, minden,
  magnolia, leesville, lakecharles, bastrop, greenville, plainview, dequincy, villeplatte),
  or "all".
- **Who to email the new password to** (default: the requester on the ticket).

If the ticket already states these, don't re-ask. Ask only for what's required and missing,
in one AskUserQuestion call.

## Temporary password

Generate one locally per reset (don't reuse):

```bash
python3 -c "import secrets,string;a=string.ascii_letters+string.digits;print('Fbh-'+''.join(secrets.choice(a) for _ in range(10))+'!')"
```

## Procedure

1. Load the Claude in Chrome tools (single ToolSearch:
   `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__javascript_tool`).
   Prefer Bren's existing signed-in tab; otherwise `tabs_context_mcp{createIfEmpty:true}` and
   use the returned tabId for all calls.

2. **One app / one user at a time.** Never batch resets across users.

3. Navigate to the app's admin (see App specifics). If redirected to a login screen, **stop
   and ask Bren to sign in** in that window — never type his credentials. A fresh Chrome MCP
   window is often not signed in.

4. **Find the exact user** and confirm it's the right person (name + email match the ticket).
   If there are two similar users, stop and ask.

5. **Show Bren exactly what will happen** — app/site, target user, and that a temporary
   password will be set — and get an explicit yes (AskUserQuestion: Reset / Cancel) **before**
   changing anything. Not cleanly reversible.

6. Set the temporary password (see App specifics), submit, wait ~2–3s, screenshot.

7. **Verify** the change succeeded (success toast / no error). Report what you actually saw.

8. **Email the credentials** (see Email step) — separate confirmation before sending.

9. Report per app/site: user, whether the reset is confirmed, and whether the email was sent.

## App specifics

Verify these each run and correct this file if they've drifted.

### RAP — `https://rap.freedomhc.com`

- Admin page: `/admin` ("Admin Panel") → **User Management** section, search box
  "Search by name or email...".
- Each user row has: **Send Invite / Reset Password / Set Password / Delete**.
- For a temp-password reset, use **Set Password** (sets a specific password you choose) →
  enter the generated temp password → confirm. (Avoid **Delete**. Avoid **Reset Password** if
  it only emails an app link — for the "temp password + email" method we want Set Password.)
- Do **not** run an unfiltered `read_page` on `/admin` (200+ users, truncates). Use `find`
  (e.g. "user row for <email>: Set Password button") and screenshots.
- Success: confirmation toast on the row. Then email the temp password.

### BlackOps — `https://<site>.blkops.com` (WordPress)

- Go to `https://<site>.blkops.com/wp-admin/users.php`. If it redirects to `wp-login.php`,
  stop and ask Bren to sign in to that site's `/wp-admin`.
- Find the user (search box), open **Edit**.
- On the profile page → **Account Management → Set New Password** → replace the generated
  strong password with the temp password (or type it) → **Update User** at the bottom.
- Leave "Send the user a notification" unchecked — we email via M365 ourselves.
- Note the **site spelling**: it's **villeplatte** (not "vlilleplatte"). A wrong spelling gives
  a Chrome connection-error page.
- For multiple sites, repeat one site at a time and report each.

## Email step (credentials via Bren's M365)

1. Load `mcp__Microsoft_365__outlook_create_draft` and `mcp__Microsoft_365__outlook_send_draft`
   via ToolSearch. Use M365 unless Bren asks for Gmail.
2. Create the draft (`bodyType: html`; allowlisted tags only — p, ul/li, b, a, br). Subject:
   `Your RAP password has been reset` / `Your Black Ops password has been reset`. Body:
   ```html
   <p>Hi {FirstName},</p>
   <p>Your password for {app} has been reset. Here are your login details:</p>
   <ul>
     <li><b>Site:</b> <a href="{app url}">{app url}</a></li>
     <li><b>Username / email:</b> {email}</li>
     <li><b>Temporary password:</b> {temp password}</li>
   </ul>
   <p>Please sign in and change your password right away.</p>
   <p>If you have any trouble, let me know.</p>
   <p>Thanks,<br>Bren</p>
   ```
3. Summarize the draft (recipient, subject, contents) and confirm via AskUserQuestion —
   Send it / edit a line / Don't send. Only after a yes, call `outlook_send_draft`.
4. Report: sent to whom, copy in Sent Items.

## Guardrails

- Confirm with Bren before setting the password, and again before sending the email — each
  time, not once per session.
- Never enter Bren's own login credentials into either app; ask him to sign in.
- Never click Delete on a user row.
- One user at a time; never batch resets across users.
- If the requester's identity or authorization is unclear, stop and ask Bren.
- PIP, POP, and Microsoft 365 are out of scope — route them (PIP/POP to Bren; M365 to the
  m365-password-reset skill) rather than improvising.
- Always verify after resetting, and report actual results, including whether the reset is
  confirmed and whether the email was sent.
