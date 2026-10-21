import { createHash, timingSafeEqual } from 'node:crypto';
import { database, respond } from './_lib/common.js';
import { assignmentParams } from './_lib/notify.js';

const TO = 'broberts@freedomhc.com';
const ONCE = 'migration-emailjs-after-account-security-20261021:' + TO;
const hash = x => createHash('sha256').update(x).digest();

export default async function handler(req, res) {
  if (req.method !== 'POST' || process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== 'feature/postgres-neon-migration' ||
      process.env.MIGRATION_PREVIEW_LOCK !== 'true' ||
      process.env.DISABLE_NOTIFICATIONS !== 'true')
    return respond(res, 404, { error: 'Not found' });

  const token = process.env.EMAILJS_ONE_TIME_TEST_TOKEN || '';
  const received = req.headers['x-migration-test-token'];
  if (token.length < 32 || typeof received !== 'string' || received.length > 200 ||
      !timingSafeEqual(hash(token), hash(received)))
    return respond(res, 404, { error: 'Not found' });

  try {
    const service = process.env.EMAILJS_SERVICE_ID;
    const template = process.env.EMAILJS_ASSIGN_TEMPLATE_ID;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    const privateKey = process.env.EMAILJS_PRIVATE_KEY;
    if (!service || !template || !publicKey || !privateKey)
      return respond(res, 503, { accepted: false, problem: 'EmailJS configuration incomplete' });

    const params = assignmentParams({
      id: 'emailjs-20261021-verification', assigned_to: TO,
      name: 'Migration QA', email: 'no-reply@example.invalid',
      contact_number: '', facility: 'Corporate', tool: 'Email',
      subject: 'TEST ONLY: Freedom support-ticket email migration',
      issue: 'One-time system verification with synthetic information. No action required.',
      priority: 'Low', status: 'Open', date_submitted: '2026-10-21'
    });
    params.to_email = TO;
    params.to_name = 'FBH IT';
    params.cc_email = '';
    params.reply_to = TO;
    params.subject = '[TEST ONLY] FBH support migration EmailJS verification';

    const claimed = await database().query(
      "INSERT INTO api_rate_limits(bucket, hits, resets_at) VALUES($1,1,NOW() + INTERVAL '10 years') ON CONFLICT(bucket) DO NOTHING RETURNING bucket",
      [ONCE]);
    if (!claimed.length) return respond(res, 409, { accepted: false, problem: 'Test already attempted' });

    // One provider request. Never automatically retry an ambiguous failure.
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: service, template_id: template, user_id: publicKey,
        accessToken: privateKey, template_params: params
      }),
      signal: AbortSignal.timeout(15000)
    });
    const providerMessage = response.ok ? '' : (await response.text()).slice(0, 200);
    console.log('One-time EmailJS provider response', response.status);
    return respond(res, response.ok ? 200 : 502, {
      accepted: response.ok, providerStatus: response.status,
      providerMessage, recipient: TO
    });
  } catch (error) {
    console.error('One-time EmailJS verification exception', error?.name || 'Error');
    return respond(res, 502, { accepted: false, problem: 'Provider request did not complete; no retry' });
  }
}
