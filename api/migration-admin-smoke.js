import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { database, respond } from './_lib/common.js';
import updateTicket from './tickets/[id].js';
import listTickets from './tickets/index.js';

// TEMPORARY: internal one-use smoke test. Never merge this file into production.
const QA_ID = 'tkt_e59b30e4992b4bd59a844a5cd15bba29';
const ONCE = 'migration-admin-route-smoke:2026-10-21:v1';
const hash = x => createHash('sha256').update(x).digest();
const isoDay = x => x instanceof Date ? x.toISOString().slice(0,10) : String(x||'').slice(0,10);

function signedCookie() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 120000 }), 'utf8').toString('base64url');
  const signature = createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  return 'fbh_session=' + payload + '.' + signature;
}
function simulateResponse() {
  return {
    statusCode: 200,
    setHeader() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(data) { return {statusCode:this.statusCode,body:data}; }
  };
}
async function call(handler, method, query, body, req) {
  const fake = {
    method, query, body,
    headers: {
      cookie: signedCookie(), host: req.headers.host,
      origin: 'https://' + req.headers.host,
      'sec-fetch-site': 'same-origin'
    }
  };
  return handler(fake, simulateResponse());
}

export default async function handler(req, res) {
  if (req.method !== 'GET' || process.env.VERCEL_ENV !== 'preview' ||
      process.env.VERCEL_GIT_COMMIT_REF !== 'feature/postgres-neon-migration' ||
      process.env.MIGRATION_PREVIEW_LOCK !== 'true' ||
      process.env.DISABLE_NOTIFICATIONS !== 'true')
    return respond(res, 404, {error:'Not found'});

  const expected = process.env.MIGRATION_SMOKE_TOKEN || '';
  const token = typeof req.query?.token === 'string' ? req.query.token : '';
  if (!process.env.SESSION_SECRET || expected.length < 32 || token.length > 200 ||
      !timingSafeEqual(hash(expected), hash(token)))
    return respond(res, 404, {error:'Not found'});

  const sql = database();
  let attempted = false;
  let initial = null;
  const tests = {};
  try {
    initial = (await sql.query('SELECT id,subject,status,assigned_to,resolved_date FROM tickets WHERE id=$1 AND deleted_at IS NULL',[QA_ID]))[0];
    // Prevent changing anything beyond the known synthetic ticket or losing older resolved timestamps.
    if (!initial || !initial.subject.startsWith('MIGRATION QA') ||
        initial.status !== 'Resolved' ||
        initial.assigned_to !== 'support@freedomhc.com' ||
        isoDay(initial.resolved_date) !== '2026-10-21')
      return respond(res, 409, {ok:false,reason:'Synthetic ticket was changed; no tests run'});

    const claimed = await sql.query(
      "INSERT INTO api_rate_limits(bucket,hits,resets_at) VALUES($1,1,NOW()+INTERVAL '10 years') ON CONFLICT(bucket) DO NOTHING RETURNING bucket",
      [ONCE]);
    if (!claimed.length) return respond(res, 409, {ok:false,reason:'Already attempted'});
    attempted = true;

    const seen = [], offsets=[];
    for(let offset=0;offset<=750;offset+=250) {
      const reply = await call(listTickets,'GET',{offset:String(offset)},undefined,req);
      if(reply.statusCode !== 200) throw new Error('Authenticated list failed');
      seen.push(...reply.body.records);offsets.push(offset);
      if(reply.body.offset === null) break;
    }
    tests.paginated = seen.length === 686 && offsets.length === 3;
    tests.legacyNumbers = seen.filter(x=>x.fields['Ticket ID']!=null).length === 685;
    tests.needsReview = seen.filter(x=>x.fields.Status==='Needs Review').length === 60;
    tests.reportData = seen.filter(x=>x.fields['Date Submitted']>='2026-09-23' && x.fields['Date Submitted']<='2026-10-21' && x.fields['Ticket ID']!=null).length === 117;

    const opened = await call(updateTicket,'PATCH',{id:QA_ID},{fields:{Status:'Open'}},req);
    tests.statusPatch = opened.statusCode===200 && opened.body.fields?.Status==='Open';
    const assigned = await call(updateTicket,'PATCH',{id:QA_ID},{fields:{'Assigned To':'broberts@freedomhc.com'}},req);
    tests.assigneePatch = assigned.statusCode===200 && assigned.body.fields?.['Assigned To']==='broberts@freedomhc.com';
    tests.notificationsSuppressed = assigned.body.notification_sent===false;
    const rejected = await call(updateTicket,'PATCH',{id:QA_ID},{fields:{'Assigned To':'unauthorized@example.invalid'}},req);
    tests.invalidAssigneeRejected = rejected.statusCode===400;
  } catch (e) {
    console.error('Migration API smoke test error',e?.message);
    tests.internalError = true;
  } finally {
    if(attempted && initial) {
      try {
        const a = await call(updateTicket,'PATCH',{id:QA_ID},{fields:{'Assigned To':initial.assigned_to}},req);
        const b = await call(updateTicket,'PATCH',{id:QA_ID},{fields:{Status:initial.status}},req);
        const restored = (await sql.query('SELECT status,assigned_to,resolved_date FROM tickets WHERE id=$1',[QA_ID]))[0];
        tests.restored = a.statusCode===200 && b.statusCode===200 &&
          restored?.status===initial.status && restored?.assigned_to===initial.assigned_to &&
          isoDay(restored.resolved_date)==='2026-10-21';
      } catch(e) {
        console.error('Migration QA state restoration failed',e?.message);
        tests.restored = false;
      }
    }
  }
  return respond(res, Object.values(tests).every(Boolean)?200:503, {ok:Object.values(tests).every(Boolean), tests});
}
