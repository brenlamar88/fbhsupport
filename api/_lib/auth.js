import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { respond } from './common.js';

const COOKIE_NAME = 'fbh_session';
const SESSION_SECONDS = 8 * 60 * 60;

function sign(payload) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('Session secret missing');
  return createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
}
export function verifyAdminPassword(input) {
  const v = process.env.ADMIN_PASSWORD_HASH || '';
  const [salt, hash] = v.split(':');
  if (!salt || !hash || !/^[a-f0-9]{32,}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(hash)) {
    throw new Error('Admin password hash missing or invalid');
  }
  const given = scryptSync(input, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(given, Buffer.from(hash, 'hex'));
}
export function setSessionCookie(res) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_SECONDS * 1000 }), 'utf8').toString('base64url');
  res.setHeader('Set-Cookie', COOKIE_NAME + '=' + payload + '.' + sign(payload) + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=' + SESSION_SECONDS);
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', COOKIE_NAME + '=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
}
export function authenticated(req) {
  const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE_NAME + '='));
  if (!cookie) return false;
  const raw = cookie.slice(COOKIE_NAME.length + 1);
  const splitAt = raw.lastIndexOf('.');
  if (splitAt < 0) return false;
  const payload = raw.slice(0, splitAt), mac = raw.slice(splitAt + 1);
  const expected = sign(payload);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return false;
  try { return Number(JSON.parse(Buffer.from(payload, 'base64url').toString()).exp) > Date.now(); }
  catch { return false; }
}
export function requireAdmin(req, res) {
  if (authenticated(req)) return true;
  respond(res, 401, { error: 'Admin sign-in required' });
  return false;
}
