import { createHash, timingSafeEqual } from 'node:crypto';
import { database, respond } from './_lib/common.js';
import { assignmentParams } from './_lib/notify.js';

// Temporary one-use delivery check. Never merge; delete immediately after use.
const RECIPIENT = 'brennan@fusepros.com';
const CLAIM = 'emailjs-test-fusepros-20261021:' + RECIPIENT;
const hash = value => createHash('sha256').update(value).digest();

export default async function handler(req, res) {
  if (req.method !== 'GET' || process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== 'feature/postgres-neon-migration' ||
      process.env.MIGRATION_PREVIEW_LOCK !== 'true' ||
      process.env.DISABLE_NOTIFICATIONS !== 'true')
    return respond(res, 404, { error: 'Not found' });

  const expected = process.env.EMAILJS_ONE_TIME_TEST_TOKEN || '';
  const supplied = typeof req.query?.token === 'string' ? req.query.token : '';
  if (expected.length < 32 || supplied.length > 200 ||
      !timingSafeEqual(hash(expected), hash(supplied)))
    return respond(res, 404, { error: 'Not found' });

  const config = {
    service: process.env.EMAILJS_SERVICE_ID,
    template: process.env.EMAILJS_ASSIGN_TEMPLATE_ID,
    publicKey: process.env.EMAILJS_PUBLIC_KEY,
    privateKey: process.env.EMAILJS_PRIVATE_KEY
  };
  if (Object.values(config).some(v => !v))
    return respond(res, 503, { accepted: false, reason: 'Email configuration is incomplete' });

  try {
    const claimed = await database().query(
      "INSERT INTO api_rate_limits(bucket,hits,resets_at) VALUES($1,1,NOW() + INTERVAL '10 years') ON CONFLICT(bucket) DO NOTHING RETURNING bucket",
      [CLAIM]
    );
    if (claimed.length === 0) return respond(res, 409, { accepted: false, reason: 'Already attempted' });

    const templateParams = assignmentParams({
      id: 'emailjs-fusepros-preview-check',
      name: 'System Test', email: 'noreply@example.invalid',
      contact_number: '', assigned_to: RECIPIENT,
      facility: 'Corporate', tool: 'Email', priority: 'Low',
      status: 'Open', date_submitted: '2026-10-21',
      subject: 'TEST ONLY — EmailJS migration verification',
      issue: 'This is a one-time notification test of the new support system. No action is required.'
    });
    templateParams.to_email = RECIPIENT;
    templateParams.to_name = 'Brennan';
    templateParams.cc_email = '';
    templateParams.reply_to = RECIPIENT;
    templateParams.subject = '[TEST ONLY] FBH support EmailJS verification';

    // At most one provider request. No retry on an unknown result.
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: config.service, template_id: config.template,
        user_id: config.publicKey, accessToken: config.privateKey,
        template_params: templateParams
      }),
      signal: AbortSignal.timeout(15000)
    });
    console.log('EmailJS FusePros test provider status', response.status);
    return respond(res, response.ok ? 200 : 502, {
      accepted: response.ok, providerStatus: response.status, recipient: RECIPIENT
    });
  } catch (e) {
    console.error('EmailJS FusePros test request error', e?.name || 'Error');
    return respond(res, 502, { accepted: false, reason: 'Provider request failed; not retried' });
  }
}
