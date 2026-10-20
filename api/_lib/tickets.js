import { database, value } from './common.js';

export const ROUTING = Object.freeze({
  'BlackOps': 'broberts@freedomhc.com',
  'SharePoint': 'bryder@freedomhc.com',
  'Email': 'support@freedomhc.com',
  'Other / General IT': 'support@freedomhc.com'
});
export function ticketRecord(row) {
  const d = x => x instanceof Date ? x.toISOString().slice(0, 10) : x ? String(x).slice(0, 10) : '';
  return {
    id: row.id,
    fields: {
      Name: row.name || '', Email: row.email, 'Contact Number': row.contact_number || '',
      Facility: row.facility, Tool: row.tool, Subject: row.subject, Issue: row.issue,
      Priority: row.priority, Status: row.status, 'Assigned To': row.assigned_to || '',
      'Date Submitted': d(row.date_submitted), 'Resolved Date': d(row.resolved_date)
    }
  };
}
export function validatedNewTicket(fields) {
  const result = {
    name: value(fields.Name, 150), email: value(fields.Email, 320).toLowerCase(),
    contact_number: value(fields['Contact Number'], 80), facility: value(fields.Facility, 100),
    tool: value(fields.Tool, 120), subject: value(fields.Subject, 300),
    issue: value(fields.Issue, 8000), priority: value(fields.Priority, 20)
  };
  if (!result.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email) ||
      !result.contact_number || !result.facility || !result.tool || !result.subject || !result.issue ||
      !['Urgent', 'High', 'Medium', 'Low'].includes(result.priority)) {
    throw new Error('Check the required ticket fields and email address');
  }
  return result;
}
export async function getTicket(id) {
  const sql = database();
  const rows = await sql.query('SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL', [id]);
  return rows[0] || null;
}
export function validateAssignee(email) {
  const v = value(email, 320).toLowerCase();
  if (!v) return '';
  const allowed = (process.env.ALLOWED_ASSIGNEE_DOMAINS || 'freedomhc.com,freedombehavioral.com')
    .split(',').map(x => x.trim().toLowerCase());
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || !allowed.includes(v.split('@')[1]))
    throw new Error('Assignee must be an authorized company email');
  return v;
}
