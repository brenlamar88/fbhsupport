import { allowedMethod, respond } from '../_lib/common.js';
import { authenticated } from '../_lib/auth.js';
export default function handler(req, res) {
  if (!allowedMethod(req, res, ['GET'])) return;
  try { return respond(res, 200, { authenticated: authenticated(req) }); }
  catch { return respond(res, 503, { error: 'Auth not configured' }); }
}
