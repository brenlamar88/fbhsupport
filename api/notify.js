import { allowedMethod, bodyObject, handleError, respond, safeMutation, value } from './_lib/common.js';
import { requireAdmin } from './_lib/auth.js';
import { getTicket } from './_lib/tickets.js';
import { sendAssignment } from './_lib/notify.js';
export default async function handler(req, res) {
  if (!allowedMethod(req, res, ['POST']) || !safeMutation(req, res) || !requireAdmin(req, res)) return;
  try {
    const id = value(bodyObject(req).id, 100);
    const ticket = await getTicket(id);
    if (!ticket) return respond(res, 404, { error: 'Ticket not found' });
    if (!ticket.assigned_to) return respond(res, 400, { error: 'Assign a ticket first' });
    const sent = await sendAssignment(ticket);
    return respond(res, sent ? 200 : 503, { sent, error: sent ? undefined : 'Mail provider not configured or delivery failed' });
  } catch (e) { return handleError(res, e); }
}
