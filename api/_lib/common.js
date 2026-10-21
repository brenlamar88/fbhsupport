import { createHmac } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export function database() {
  if (!process.env.DATABASE_URL) throw new Error('Database is not configured');
  return neon(process.env.DATABASE_URL);
}
export function respond(res, status, data) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(data);
}
export function allowedMethod(req, res, methods) {
  if (methods.includes(req.method)) return true;
  res.setHeader('Allow', methods.join(', '));
  respond(res, 405, { error: 'Method not allowed' });
  return false;
}
export function safeMutation(req, res) {
  const origin = req.headers.origin;
  if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && (() => {
    try { return new URL(origin).host !== req.headers.host; } catch { return true; }
  })())) {
    respond(res, 403, { error: 'Cross-site requests are blocked' });
    return false;
  }
  return true;
}
export function bodyObject(req) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid JSON object');
  return body;
}
export function value(v, max = 300) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }
export function clientIpHash(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  const secret = process.env.RATE_LIMIT_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error('Rate-limit secret missing');
  return createHmac('sha256', secret).update(ip).digest('hex');
}
export async function rateLimit(req, scope, maximum, minutes) {
  const sql = database();
  const bucket = scope + ':' + clientIpHash(req);
  const rows = await sql.query(
    "INSERT INTO api_rate_limits(bucket, hits, resets_at) VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 minute')) " +
    "ON CONFLICT (bucket) DO UPDATE SET hits = CASE WHEN api_rate_limits.resets_at < NOW() THEN 1 ELSE api_rate_limits.hits + 1 END, " +
    "resets_at = CASE WHEN api_rate_limits.resets_at < NOW() THEN NOW() + ($2 * INTERVAL '1 minute') ELSE api_rate_limits.resets_at END RETURNING hits",
    [bucket, minutes]
  );
  return Number(rows[0].hits) <= maximum;
}
export function handleError(res, error) {
  console.error('Support API error:', error?.message || error);
  if (error?.message === 'Database is not configured' || error?.message === 'Rate-limit secret missing')
    return respond(res, 503, { error: 'Service configuration is incomplete' });
  return respond(res, 500, { error: 'Something went wrong. Please try again.' });
}
