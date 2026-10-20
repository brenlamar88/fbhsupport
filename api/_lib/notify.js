export async function sendAssignment(row) {
  const from = process.env.MAIL_FROM, key = process.env.RESEND_API_KEY;
  if (!row.assigned_to || !from || !key) return false;
  const ref = String(row.id).slice(-6).toUpperCase();
  // Never send Issue or requester data over an unapproved notification service.
  const subject = '[FBH Support] ' + row.priority + ' ticket ' + ref;
  const body = 'A support ticket has been assigned to you.\n\n' +
    'Reference: ' + ref + '\nFacility: ' + row.facility +
    '\nTool: ' + row.tool + '\nPriority: ' + row.priority +
    '\n\nSign in to the admin dashboard to view the details.';
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [row.assigned_to], subject, text: body })
  });
  if (!result.ok) { console.error('Assignment email failed:', result.status); return false; }
  return true;
}
export async function pushCreated(row) {
  if (!process.env.NTFY_TOPIC) return;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.NTFY_TOKEN) headers.Authorization = 'Bearer ' + process.env.NTFY_TOKEN;
    await fetch('https://ntfy.sh', {
      method: 'POST', headers,
      body: JSON.stringify({
        topic: process.env.NTFY_TOPIC,
        title: 'New ' + row.priority + ' support ticket',
        message: 'Ref ' + row.id.slice(-6).toUpperCase() + '. Open the admin dashboard for details.',
        priority: row.priority === 'Urgent' ? 5 : row.priority === 'High' ? 4 : 3,
        tags: ['ticket']
      })
    });
  } catch (e) { console.error('Push notification failed:', e.message); }
}
