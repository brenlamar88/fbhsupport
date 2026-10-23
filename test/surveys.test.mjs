import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSurvey, normalizeSurveys, surveyDate } from '../api/_lib/surveys.js';
import handler from '../api/reports/surveys.js';

const row = {
  'Submission ID': 6685924516125023000,
  'Submission Date': 'Oct 23, 2026',
  'Freedom Facility': 'Plainview',
  'Choose a survey': 'Referral',
  "Your Facility's Name": 'Example Nursing & Rehab',
  'Referral call was handled in a timely manner.': 5,
  'Pre-screen evaluation on site was performed during convenience of patient/facility.': 2,
  'Informed about the opportunity to tour the facility?': 5,
  'Patient Age': 3,
};

test('survey dates parse from the export formats', () => {
  assert.equal(surveyDate('Oct 23, 2026'), '2026-10-23');
  assert.equal(surveyDate('Sep 1, 2024'), '2024-09-01');
  assert.equal(surveyDate('2026-03-05'), '2026-03-05');
  assert.equal(surveyDate('10/23/2026'), '2026-10-23');
  assert.equal(surveyDate('Feb 30, 2026'), null);
  assert.equal(surveyDate(''), null);
});

test('a survey row keeps only summary fields and ignores patient age', () => {
  const r = normalizeSurvey(row);
  assert.equal(r.id, BigInt(6685924516125023000).toString());
  assert.equal(r.submitted_on, '2026-10-23');
  assert.equal(r.facility, 'Plainview');
  assert.equal(r.survey_type, 'Referral');
  assert.equal(r.avg_score, 4);
  assert.equal(r.low_flag, true);
  assert.equal(r.referring_facility, 'Example Nursing & Rehab');
  assert.deepEqual(Object.keys(r).sort(), ['avg_score', 'facility', 'id', 'low_flag', 'referring_facility', 'submitted_on', 'survey_type']);
});

test('legacy rows without a type count as Discharge only when rated', () => {
  const rated = normalizeSurvey({ 'Submission ID': '1', 'Submission Date': 'Sep 18, 2024', 'In general, rank services at Freedom Behavioral.': 5 });
  assert.equal(rated.survey_type, 'Discharge');
  assert.equal(rated.facility, 'Unassigned');
  assert.equal(rated.low_flag, false);
  const blank = normalizeSurvey({ 'Submission ID': '2', 'Submission Date': 'Sep 18, 2024' });
  assert.equal(blank.survey_type, 'Unspecified');
  assert.equal(blank.avg_score, null);
});

test('bad rows are skipped and duplicate IDs collapse', () => {
  const out = normalizeSurveys([row, row, { 'Submission ID': 'abc', 'Submission Date': 'Oct 1, 2026' }]);
  assert.equal(out.rows.length, 1);
  assert.equal(out.skipped, 1);
  assert.throws(() => normalizeSurveys([]));
});

test('survey report API requires admin sign-in', async () => {
  const original = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = 'x'.repeat(40);
  let status, body;
  const res = { setHeader() {}, status(s) { status = s; return { json(b) { body = b; } }; } };
  try { await handler({ method: 'GET', headers: {}, query: {} }, res); }
  finally { if (original === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = original; }
  assert.equal(status, 401);
  assert.match(body.error, /sign-in/i);
});
