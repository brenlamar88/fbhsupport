import { allowedMethod, respond, safeMutation } from '../_lib/common.js';
import { clearSessionCookie } from '../_lib/auth.js';
export default function handler(req, res) {
  if (!allowedMethod(req, res, ['POST']) || !safeMutation(req, res)) return;
  clearSessionCookie(res);
  return respond(res, 200, { ok: true });
}
