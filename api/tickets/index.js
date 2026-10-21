import { allowedMethod, bodyObject, database, handleError, rateLimit, respond, safeMutation } from '../_lib/common.js';
import { requireAdmin } from '../_lib/auth.js';
import { ROUTING, ticketRecord, validateAssignee, validatedNewTicket } from '../_lib/tickets.js';
import { pushCreated, notifyCreated } from '../_lib/notify.js';

export default async function handler(req, res) {
  if (!allowedMethod(req, res, ['GET', 'POST'])) return;
  try {
    const sql = database();
    if (req.method === 'GET') {
      if (!requireAdmin(req, res)) return;
      const offset = Number(req.query?.offset || 0);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
        return respond(res, 400, { error: 'Invalid offset' });
      const rows = await sql.query(
        'SELECT * FROM tickets WHERE deleted_at IS NULL ORDER BY date_submitted DESC, id DESC LIMIT 250 OFFSET $1', [offset]);
      return respond(res, 200, { records: rows.map(ticketRecord), offset: rows.length === 250 ? String(offset + 250) : null });
    }
    if (!safeMutation(req, res)) return;
    // A protected preview must never accept a ticket before notifications and admin login are tested.
    if (process.env.MIGRATION_PREVIEW_LOCK === 'true')
      return respond(res, 503, { error: 'Migration preview: ticket submissions are disabled during setup.' });
    if (Number(req.headers['content-length'] || 0) > 20000)
      return respond(res, 413, { error: 'Ticket too large' });
    if (!await rateLimit(req, 'submit-ticket', 20, 60))
      return respond(res, 429, { error: 'Too many submissions. Please try later.' });
    let fields;
    try { const body = bodyObject(req); fields = validatedNewTicket(body.fields || body); }
    catch { return respond(res, 400, { error: 'Please check all required ticket fields' }); }
    const assigned = validateAssignee(ROUTING[fields.tool] || 'broberts@freedomhc.com');
    const rows = await sql.query(
      'INSERT INTO tickets (name, email, contact_number, facility, tool, subject, issue, priority, status, assigned_to) ' +
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Open',$9) RETURNING *",
      [fields.name, fields.email, fields.contact_number, fields.facility, fields.tool, fields.subject, fields.issue, fields.priority, assigned]
    );
    const ticket = rows[0];
    // Notifications are best effort: a mail failure must not undo a saved ticket.
    await Promise.allSettled([notifyCreated(ticket), pushCreated(ticket)]);
    return respond(res, 201, { id: ticket.id });
  } catch (e) { return handleError(res, e); }
}
