import { allowedMethod, bodyObject, database, handleError, respond, safeMutation, value } from '../_lib/common.js';
import { requireAdmin } from '../_lib/auth.js';
import { normalizeSurveys, surveyRecord } from '../_lib/surveys.js';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS survey_responses (id TEXT PRIMARY KEY, submitted_on DATE NOT NULL, facility TEXT NOT NULL, survey_type TEXT NOT NULL, ' +
    'avg_score NUMERIC(4,3), low_flag BOOLEAN NOT NULL DEFAULT FALSE, referring_facility TEXT, ' +
    'created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
  'CREATE INDEX IF NOT EXISTS survey_responses_date_idx ON survey_responses(submitted_on)',
  "CREATE TABLE IF NOT EXISTS survey_imports (id BIGSERIAL PRIMARY KEY, file_name TEXT NOT NULL DEFAULT '', row_count INTEGER NOT NULL, imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
];

const missingTable = (e) => e?.code === '42P01' || /relation .* does not exist/i.test(e?.message || '');

export default async function handler(req, res) {
  if (!allowedMethod(req, res, ['GET', 'POST'])) return;
  try {
    if (!requireAdmin(req, res)) return;
    const sql = database();

    if (req.method === 'GET') {
      let rows, imports;
      try {
        rows = await sql.query('SELECT id, submitted_on, facility, survey_type, avg_score, low_flag, referring_facility FROM survey_responses ORDER BY submitted_on, id');
        imports = await sql.query('SELECT file_name, row_count, imported_at FROM survey_imports ORDER BY imported_at DESC LIMIT 1');
      } catch (e) {
        if (missingTable(e)) return respond(res, 200, { rows: [], lastImport: null });
        throw e;
      }
      return respond(res, 200, { rows: rows.map(surveyRecord), lastImport: imports[0] || null });
    }

    if (!safeMutation(req, res)) return;
    if (Number(req.headers['content-length'] || 0) > 3_000_000) return respond(res, 413, { error: 'Upload too large' });
    let parsed, fileName;
    try {
      const body = bodyObject(req);
      fileName = value(body.fileName, 200);
      parsed = normalizeSurveys(body.rows);
    } catch { return respond(res, 400, { error: 'That file does not look like a 5 Star Survey export' }); }
    if (!parsed.rows.length) return respond(res, 400, { error: 'No usable survey rows found' });

    for (const statement of SCHEMA) await sql.query(statement);
    const r = parsed.rows;
    const before = await sql.query('SELECT COUNT(*)::int AS n FROM survey_responses');
    await sql.transaction([
      sql.query(
        'INSERT INTO survey_responses (id, submitted_on, facility, survey_type, avg_score, low_flag, referring_facility) ' +
        'SELECT * FROM unnest($1::text[], $2::date[], $3::text[], $4::text[], $5::numeric[], $6::boolean[], $7::text[]) ' +
        'ON CONFLICT (id) DO UPDATE SET submitted_on = EXCLUDED.submitted_on, facility = EXCLUDED.facility, survey_type = EXCLUDED.survey_type, ' +
        'avg_score = EXCLUDED.avg_score, low_flag = EXCLUDED.low_flag, referring_facility = EXCLUDED.referring_facility, updated_at = NOW()',
        [r.map((x) => x.id), r.map((x) => x.submitted_on), r.map((x) => x.facility), r.map((x) => x.survey_type),
          r.map((x) => x.avg_score), r.map((x) => x.low_flag), r.map((x) => x.referring_facility)]
      ),
      sql.query('INSERT INTO survey_imports (file_name, row_count) VALUES ($1, $2)', [fileName, r.length]),
    ]);
    const after = await sql.query('SELECT COUNT(*)::int AS n FROM survey_responses');
    return respond(res, 200, { imported: r.length, added: after[0].n - before[0].n, skipped: parsed.skipped, total: after[0].n });
  } catch (e) { return handleError(res, e); }
}
