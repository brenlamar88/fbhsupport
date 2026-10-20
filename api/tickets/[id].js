import { allowedMethod, bodyObject, database, handleError, respond, safeMutation, value } from '../_lib/common.js';
import { requireAdmin } from '../_lib/auth.js';
import { ticketRecord, validateAssignee } from '../_lib/tickets.js';
import { sendAssignment } from '../_lib/notify.js';

export default async function handler(req, res) {
  if (!allowedMethod(req, res, ['PATCH', 'DELETE']) || !safeMutation(req, res) || !requireAdmin(req, res)) return;
  try {
    const id = value(req.query.id, 100);
    if (!id) return respond(res, 400, { error: 'Missing ticket id' });
    const sql = database();
    if (req.method === 'DELETE') {
      const rows = await sql.query(
        'UPDATE tickets SET deleted_at=NOW(), updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING id', [id]);
      if (!rows.length) return respond(res, 404, { error: 'Ticket not found' });
      await sql.query("INSERT INTO ticket_events(ticket_id,event_type,actor,payload) VALUES($1,'deleted','admin','{}'::jsonb)", [id]);
      return respond(res, 200, { deleted: true });
    }
    let fields;
    try { fields = bodyObject(req).fields; }
    catch { return respond(res, 400, { error: 'Invalid request' }); }
    if (!fields || typeof fields !== 'object' || Array.isArray(fields))
      return respond(res, 400, { error: 'Missing update fields' });
    const keys = Object.keys(fields);
    if (!keys.length || keys.some(k => !['Status', 'Resolved Date', 'Assigned To'].includes(k)))
      return respond(res, 400, { error: 'Unsupported update field' });
    let rows;
    if ('Status' in fields) {
      if (!['Open', 'In Progress', 'Resolved'].includes(fields.Status))
        return respond(res, 400, { error: 'Invalid status' });
      const resolved = fields.Status === 'Resolved';
      rows = await sql.query(
        'UPDATE tickets SET status=$2, resolved_date=CASE WHEN $3 THEN CURRENT_DATE ELSE NULL END, updated_at=NOW() ' +
        'WHERE id=$1 AND deleted_at IS NULL RETURNING *', [id, fields.Status, resolved]);
    } else if ('Assigned To' in fields) {
      let email;
      try { email = validateAssignee(fields['Assigned To']); }
      catch { return respond(res, 400, { error: 'Invalid assignee' }); }
      rows = await sql.query(
        'UPDATE tickets SET assigned_to=$2, updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL RETURNING *', [id, email]);
    } else return respond(res, 400, { error: 'Unsupported update' });
    if (!rows.length) return respond(res, 404, { error: 'Ticket not found' });
    const row = rows[0];
    await sql.query('INSERT INTO ticket_events(ticket_id,event_type,actor,payload) VALUES($1,$2,$3,$4::jsonb)',
      [id, 'updated', 'admin', JSON.stringify({ fields: keys })]);
    let notificationSent = false;
    if ('Assigned To' in fields && row.assigned_to) {
      try { notificationSent = await sendAssignment(row); }
      catch (e) { console.error('Email failure', e.message); }
    }
    return respond(res, 200, { ...ticketRecord(row), notification_sent: notificationSent });
  } catch (e) { return handleError(res, e); }
}
