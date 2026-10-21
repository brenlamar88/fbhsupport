// Safe-by-default importer. Run locally with AIRTABLE_TOKEN and DATABASE_URL set.
// Preview: node scripts/migrate-airtable.mjs
// Actually write: node scripts/migrate-airtable.mjs --write
// Airtable credentials must not be committed or pasted in chat.
import { neon } from '@neondatabase/serverless';

const WRITE = process.argv.includes('--write');
const token = process.env.AIRTABLE_TOKEN;
const dbUrl = process.env.DATABASE_URL;
const base = process.env.AIRTABLE_BASE_ID || 'appOQI2Im5XebeIyg';
const table = process.env.AIRTABLE_TABLE_ID || 'tblEMz0BecYmu48y0';
if (!token || !dbUrl) {
  console.error('Set AIRTABLE_TOKEN and DATABASE_URL in your local environment first.');
  process.exit(1);
}
const sql = neon(dbUrl);
const url = 'https://api.airtable.com/v0/' + encodeURIComponent(base) + '/' + encodeURIComponent(table);
const all = [];
let offset;
do {
  const u = new URL(url);
  u.searchParams.set('pageSize', '100');
  if (offset) u.searchParams.set('offset', offset);
  let res;
  for (let attempt = 0; attempt < 9; attempt++) {
    res = await fetch(u, { headers: {Authorization: 'Bearer ' + token} });
    if (res.status !== 429) break;
    if (attempt === 8) throw new Error('Airtable kept returning HTTP 429');
    await new Promise(r => setTimeout(r, Math.min(2000 * (attempt + 1), 12000)));
  }
  if (!res.ok) throw new Error('Airtable export failed with HTTP ' + res.status);
  const data = await res.json();
  if (!Array.isArray(data.records)) throw new Error('Malformed Airtable response');
  all.push(...data.records);
  offset = data.offset;
  if (offset) await new Promise(r => setTimeout(r, 250));
} while (offset);

const ids = all.map(r => r.id);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate Airtable IDs in export');
console.log('Airtable tickets retrieved:', all.length);
if (!WRITE) {
  console.log('DRY RUN ONLY. No database records were written.');
  console.log('Review the total and run again with --write after you approve the destination and data handling.');
  process.exit(0);
}
function str(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(str).join(', ');
  return String(v);
}
function date(v) {
  const s = str(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
let saved = 0;
for (const r of all) {
  const f = r.fields || {};
  await sql.query(
    "INSERT INTO tickets (id,name,email,contact_number,facility,tool,subject,issue,priority,status,assigned_to,date_submitted,resolved_date,created_at) " +
    "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::date,CURRENT_DATE),$13::date,COALESCE($14::timestamptz,NOW())) " +
    "ON CONFLICT (id) DO UPDATE SET " +
    "name=EXCLUDED.name,email=EXCLUDED.email,contact_number=EXCLUDED.contact_number,facility=EXCLUDED.facility," +
    "tool=EXCLUDED.tool,subject=EXCLUDED.subject,issue=EXCLUDED.issue,priority=EXCLUDED.priority," +
    "status=EXCLUDED.status,assigned_to=EXCLUDED.assigned_to,date_submitted=EXCLUDED.date_submitted," +
    "resolved_date=EXCLUDED.resolved_date,updated_at=NOW()",
    [
      r.id, str(f.Name), str(f.Email), str(f['Contact Number']), str(f.Facility),
      str(f.Tool), str(f.Subject), str(f.Issue), str(f.Priority || 'Medium'),
      str(f.Status || 'Open'), str(f['Assigned To']),
      date(f['Date Submitted']) || date(r.createdTime), date(f['Resolved Date']), r.createdTime || null
    ]
  );
  saved++;
  if (saved % 100 === 0) console.log('Imported:', saved);
}
const result = await sql.query("SELECT COUNT(*)::int AS count FROM tickets WHERE id LIKE 'rec%' AND deleted_at IS NULL");
console.log('Source record count:', all.length, '| Destination Airtable-origin records:', result[0].count);
if (Number(result[0].count) !== all.length) {
  console.error('Counts do not match. Investigate before cutover.');
  process.exitCode = 2;
} else console.log('Count verification succeeded. Compare sample records and reporting totals before cutover.');
