import { database, respond } from './_lib/common.js';

// Temporary migration smoke test. Production never enables MIGRATION_PREVIEW_LOCK.
export default async function handler(req, res) {
  if (process.env.MIGRATION_PREVIEW_LOCK !== 'true') {
    return respond(res, 404, { error: 'Not found' });
  }
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method not allowed' });
  try {
    const rows = await database().query('SELECT 1::integer AS connected');
    return respond(res, 200, { database: Number(rows?.[0]?.connected) === 1 ? 'connected' : 'unavailable' });
  } catch (error) {
    console.error('Migration preview DB health failed:', error?.message || 'error');
    return respond(res, 503, { database: 'unavailable' });
  }
}
