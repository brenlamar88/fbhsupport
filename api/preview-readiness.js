import { database, respond } from './_lib/common.js';
import { verifyAdminPassword } from './_lib/auth.js';
import { assignmentParams } from './_lib/notify.js';

// Short-lived, read-only diagnostics. Remove immediately after preview verification.
export default async function handler(req, res) {
  if (req.method !== 'GET' ||
      process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== 'feature/postgres-neon-migration' ||
      process.env.MIGRATION_PREVIEW_LOCK !== 'true') {
    return respond(res, 404, { error: 'Not found' });
  }
  const checks = { previewLocked: true, database: false, adminPasswordHashValid: false, emailJSPrivateKeyPresent: false, emailJSTemplateCompatible: false };
  try {
    const value = await database().query('SELECT 1::integer AS connected');
    checks.database = Number(value[0]?.connected) === 1;
  } catch (_) { }
  try {
    checks.adminPasswordHashValid = verifyAdminPassword('wrong-preview-test-password') === false;
  } catch (_) { }
  checks.emailJSPrivateKeyPresent = (process.env.EMAILJS_PRIVATE_KEY || '').trim().length >= 8
    && (process.env.EMAILJS_PUBLIC_KEY || '').trim().length >= 8
    && !!process.env.EMAILJS_SERVICE_ID && !!process.env.EMAILJS_ASSIGN_TEMPLATE_ID;
  try {
    const p = assignmentParams({ id:'recTest00001234', assigned_to:'support@example.invalid',
      name:'Demo', email:'demo@example.invalid', contact_number:'555-0100',
      facility:'Corporate', tool:'Email', subject:'Testing', issue:'<script>not html</script>',
      priority:'Low', status:'Open', date_submitted:'2026-10-21' });
    checks.emailJSTemplateCompatible = p.to_email === 'support@example.invalid'
      && p.message_html.includes('&lt;script&gt;') && !p.message_html.includes('<script>');
  } catch (_) { }
  return respond(res, 200, { checks });
}
