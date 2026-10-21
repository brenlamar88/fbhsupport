# Keeping EmailJS during the Neon database migration

The database changes from Airtable to Neon PostgreSQL; the existing EmailJS service and assignment template stay in use.

## Server environment variables

Configure these privately in Vercel for the protected preview and eventually production:

- `EMAILJS_SERVICE_ID`: existing EmailJS service (`service_ucspnwu`)
- `EMAILJS_ASSIGN_TEMPLATE_ID`: existing assignment template (`template_i1zrsar`)
- `EMAILJS_PUBLIC_KEY`: public key from your EmailJS account
- `EMAILJS_PRIVATE_KEY`: private key from your EmailJS account, kept on the server
- `EMAILJS_CONFIRM_TEMPLATE_ID`: leave blank to preserve the current absence of requester confirmations

Ensure the EmailJS account permits requests originating from a server (rather than a website browser).
Do not add any private key to HTML, public JavaScript, Git or chat messages.

## Expected behavior

- On public ticket submission, the server saves the ticket in PostgreSQL before it tries EmailJS.
- The existing assignee template receives familiar variables such as `to_email`, `subject`, `message`, `message_html`, `issue`, `facility`, `priority`, `ref` and `reply_to`.
- Changing an assignee or manually selecting Notify will also use the same EmailJS service.
- Requester confirmation remains disabled until you explicitly configure another EmailJS template.
- Notifications are best effort; if sending fails, ticket creation still succeeds. Check delivery and quota before cutover.

EmailJS currently limits requests to one send per second. The implementation retries brief 429 responses. For higher-volume production usage, add a durable job queue/outbox rather than relying on in-request retries.

**This file overrides the references to Resend in `docs/neon-migration-runbook.md`; no Resend integration or account is required.**

## Deployment status

This branch is staging only. Never merge until the Neon database, Vercel environment variables, migration and full tests have been completed.