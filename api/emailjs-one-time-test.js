import { createHash, timingSafeEqual } from 'node:crypto';
import { database, respond } from './_lib/common.js';
import { assignmentParams } from './_lib/notify.js';

// Temporary one-time email verification route. Remove immediately after testing.
const TARGET = 'broberts@freedomhc.com';
const BUCKET = 'migration-emailjs-once:2026-10-21:' + TARGET;
const digest = s => createHash('sha256').update(s).digest();

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method) ||
      process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== 'feature/postgres-neon-migration' ||
      process.env.MIGRATION_PREVIEW_LOCK !== 'true' ||
      process.env.DISABLE_NOTIFICATIONS !== 'true') {
    return respond(res, 404, { error: 'Not found' });
  }

  const expected = process.env.EMAILJS_ONE_TIME_TEST_TOKEN || '';
  const supplied = req.method === 'GET' ? req.query?.token : req.headers['x-preview-email-test-token'];
  if (expected.length < 32 || typeof supplied !== 'string' || supplied.length > 200 ||
      !timingSafeEqual(digest(expected), digest(supplied))) {
    return respond(res, 404, { error: 'Not found' });
  }

  try {
    const sql = database();
    // This unique claim prevents duplicate requests from sending duplicate email.
    const claimed = await sql.query(
      'INSERT INTO api_rate_limits(bucket,hits,resets_at) VALUES($1,1,NOW() + INTERVAL \'10 years\') ON CONFLICT(bucket) DO NOTHING RETURNING bucket',
      [BUCKET]
    );
    if (!claimed.length) return respond(res, 409, { accepted: false, reason: 'Already attempted' });

    const params = assignmentParams({
      id: 'emailjs-preflight-20261021', assigned_to: TARGET,
      name: 'Migration QA', email: 'noreply@example.invalid',
      contact_number: '', facility: 'Corporate', tool: 'Email',
      subject: 'TEST ONLY - Neon migration EmailJS verification',
      issue: 'This is one authorized test notification; no action or support work is required.',
      priority: 'Low', status: 'Open', date_submitted: '2026-10-21'
    });
    params.to_email = TARGET;
    params.to_name = 'FBH IT';
    params.cc_email = '';
    params.reply_to = TARGET;
    params.subject = '[TEST ONLY] Freedom Behavioral Health EmailJS migration';
    const service = process.env.EMAILJS_SERVICE_ID;
    const template = process.env.EMAILJS_ASSIGN_TEMPLATE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;
    if (!service || !template || !publicKey || !privateKey)
      return respond(res, 503, { accepted: false, reason: 'Missing email configuration' });

    // Exactly one outbound attempt; deliberately no retry after an ambiguous timeout.
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: service, template_id: template,
        user_id: publicKey, accessToken: privateKey,
        template_params: params
      }),
      signal: AbortSignal.timeout(15000)
    });
    console.log('EmailJS single test result HTTP', response.status);
    return respond(res, response.ok ? 200 : 502, {
      accepted: response.ok, provider_status: response.status,
      recipient: TARGET
    });
  } catch (e) {
    console.error('EmailJS one-time test failed:', e?.name || 'Error');
    return respond(res, 502, { accepted: false, reason: 'Provider request failed; not retried' });
  }
}
