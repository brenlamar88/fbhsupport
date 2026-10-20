import { allowedMethod, bodyObject, handleError, rateLimit, respond, safeMutation } from '../_lib/common.js';
import { setSessionCookie, verifyAdminPassword } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!allowedMethod(req, res, ['POST']) || !safeMutation(req, res)) return;
  try {
    if (!await rateLimit(req, 'admin-login', 10, 15)) return respond(res, 429, { error: 'Too many attempts. Try later.' });
    const password = bodyObject(req).password;
    if (typeof password !== 'string' || password.length > 500 || !verifyAdminPassword(password))
      return respond(res, 401, { error: 'Invalid login' });
    setSessionCookie(res);
    return respond(res, 200, { ok: true });
  } catch (e) { return handleError(res, e); }
}
