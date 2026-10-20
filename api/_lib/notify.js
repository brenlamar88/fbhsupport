// EmailJS stays in place. All sends run on Vercel, not in browser JS.
// EmailJS Account > Security must allow non-browser API requests.
// EMAILJS_PUBLIC_KEY and EMAILJS_PRIVATE_KEY live in server environment variables.
const URL_EMAILJS = 'https://api.emailjs.com/api/v1.0/email/send';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const esc = value => String(value == null ? '' : value)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const date = v => v instanceof Date ? v.toISOString().slice(0,10) : v ? String(v).slice(0,10) : '';

function config() {
  return {
    service: process.env.EMAILJS_SERVICE_ID || 'service_ucspnwu',
    assignment: process.env.EMAILJS_ASSIGN_TEMPLATE_ID || 'template_i1zrsar',
    confirmation: process.env.EMAILJS_CONFIRM_TEMPLATE_ID || '',
    publicKey: process.env.EMAILJS_PUBLIC_KEY || '',
    privateKey: process.env.EMAILJS_PRIVATE_KEY || ''
  };
}

async function sendTemplate(template, params) {
  const c = config();
  if (!c.service || !template || !c.publicKey || !c.privateKey) {
    console.error('EmailJS server credentials or template not configured');
    return false;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(URL_EMAILJS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: c.service, template_id: template, user_id: c.publicKey,
          accessToken: c.privateKey, template_params: params
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (response.ok) return true;
      if (response.status === 429 && attempt < 2) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      console.error('EmailJS returned HTTP', response.status);
      return false;
    } catch (err) {
      console.error('EmailJS request failed:', err?.name || 'NetworkError');
      if (attempt < 2) await sleep(1200 * (attempt + 1));
    }
  }
  return false;
}

export function assignmentParams(row) {
  const ref = String(row.id).slice(-6).toUpperCase();
  const assignee = row.assigned_to || '';
  const name = row.name || '', email = row.email || '', phone = row.contact_number || '';
  const facility = row.facility || '', tool = row.tool || '', subject = row.subject || '';
  const issue = row.issue || '', priority = row.priority || 'Medium', status = row.status || 'Open';
  const submitted = date(row.date_submitted);
  const heading = '[FBH Support] ' + priority + ' — ' + (subject || tool || 'Ticket') + ' (' + facility + ')';
  const message = [
    'Hello,','','A support ticket has been assigned to you:','',
    'Reference: ' + ref,'From: ' + name + ' <' + email + '>',
    ...(phone ? ['Phone: ' + phone] : []),
    'Facility: ' + facility,'Tool/System: ' + tool,'Priority: ' + priority,
    'Status: ' + status,'Date submitted: ' + submitted,'',
    'Subject: ' + subject,'','Issue:',issue,'',
    '— Freedom Behavioral Health · Technology Hub'
  ].join('\n');
  const rows = [
    ['Reference',ref],['From',name ? name+' <'+email+'>' : email],
    ...(phone ? [['Phone',phone]] : []),
    ['Facility',facility],['Tool / System',tool],['Priority',priority],
    ['Status',status],['Date submitted',submitted]
  ];
  const htmlRows = rows.map(pair =>
    '<tr><td style="padding:4px 16px 4px 0;color:#888;vertical-align:top">' + esc(pair[0]) +
    '</td><td style="padding:4px 0;font-weight:600">' + esc(pair[1] || '—') + '</td></tr>'
  ).join('');
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5">',
    '<p style="margin:0 0 12px">Hello,</p>',
    '<p style="margin:0 0 12px">A support ticket has been assigned to you.</p>',
    '<table style="border-collapse:collapse;margin:0 0 14px">', htmlRows, '</table>',
    '<p style="margin:0 0 3px;color:#888;font-size:12px">Subject</p>',
    '<p style="margin:0 0 14px">', esc(subject), '</p>',
    '<p style="margin:0 0 3px;color:#888;font-size:12px">Issue</p>',
    '<p style="margin:0;white-space:pre-wrap">', esc(issue), '</p>',
    '<hr style="border:none;border-top:1px solid #e5e5e3;margin:16px 0">',
    '<p style="color:#888;font-size:12px">Freedom Behavioral Health · Technology Hub</p>',
    '</div>'
  ].join('');
  return {
    to_email:assignee, to_name:assignee,
    subject:heading, message, message_html:html, cc_email:email, reply_to:email,
    ref, requester_name:name, requester_email:email, contact_number:phone,
    facility, tool, priority, status, date_submitted:submitted,
    ticket_subject:subject, issue
  };
}

export async function sendAssignment(row) {
  if (!row?.assigned_to) return false;
  return sendTemplate(config().assignment, assignmentParams(row));
}

export async function sendRequesterConfirmation(row) {
  const template = config().confirmation;
  if (!template || !row?.email) return false; // Previous setup disabled confirmation.
  return sendTemplate(template, {
    to_email:row.email, to_name:row.name||'', ref:String(row.id).slice(-6).toUpperCase(),
    subject:row.subject||'', facility:row.facility||'', tool:row.tool||'',
    priority:row.priority||'Medium', issue:row.issue||''
  });
}

export async function notifyCreated(row) {
  const assignmentSent = await sendAssignment(row);
  if (config().confirmation) {
    // EmailJS limits calls to one request per second.
    if (assignmentSent) await sleep(1200);
    await sendRequesterConfirmation(row);
  }
  return assignmentSent;
}

export async function pushCreated(row) {
  if (!process.env.NTFY_TOPIC) return;
  try {
    const headers = { 'Content-Type':'application/json' };
    if (process.env.NTFY_TOKEN) headers.Authorization = 'Bearer ' + process.env.NTFY_TOKEN;
    const response = await fetch('https://ntfy.sh', {
      method:'POST', headers, signal:AbortSignal.timeout(10000),
      body:JSON.stringify({
        topic:process.env.NTFY_TOPIC, title:'New ' + row.priority + ' support ticket',
        message:'Ref ' + row.id.slice(-6).toUpperCase() + '. Open the admin dashboard for details.',
        priority:row.priority==='Urgent'?5:row.priority==='High'?4:3, tags:['ticket']
      })
    });
    if (!response.ok) console.error('Push notification HTTP',response.status);
  } catch (err) { console.error('Push notification failure:',err?.name||'NetworkError'); }
}
