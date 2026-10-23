// 5 Star Survey responses: normalises rows from the survey export (parsed in the
// admin's browser) into the summary fields the report needs. Respondent names,
// comments and patient fields are never stored.
import { value } from './common.js';

export const SURVEY_TYPES = ['Referral', 'Discharge', 'Admission'];
export const MAX_SURVEY_ROWS = 5000;

// Export columns the browser may send. Every other non-numeric column is dropped
// before upload; numeric columns not listed in NOT_RATINGS are 1-5 question scores.
export const SURVEY_TEXT_FIELDS = ['Submission ID', 'Submission Date', 'Freedom Facility', 'Choose a survey', "Your Facility's Name"];
export const NOT_RATINGS = ['Submission ID', 'Patient Age', 'Last Update Date'];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function surveyDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = typeof v === 'string' ? v.trim() : '';
  let y, m, d;
  let hit = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (hit) [, y, m, d] = hit.map(Number);
  else if ((hit = s.match(/^([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})$/))) { m = MONTHS[hit[1].toLowerCase()]; d = Number(hit[2]); y = Number(hit[3]); }
  else if ((hit = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { m = Number(hit[1]); d = Number(hit[2]); y = Number(hit[3]); }
  if (!y || !m || !d) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 2000 || y > 2100) return null;
  return date.toISOString().slice(0, 10);
}

export function normalizeSurvey(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid survey row');
  const idRaw = raw['Submission ID'];
  const id = typeof idRaw === 'number' && Number.isFinite(idRaw) ? BigInt(Math.round(idRaw)).toString() : value(String(idRaw ?? ''), 40);
  if (!/^\d{1,30}$/.test(id)) throw new Error('Invalid submission ID');
  const submitted_on = surveyDate(raw['Submission Date']);
  if (!submitted_on) throw new Error('Invalid submission date');

  const ratings = [];
  for (const [k, v] of Object.entries(raw)) {
    if (NOT_RATINGS.includes(k) || SURVEY_TEXT_FIELDS.includes(k)) continue;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5) ratings.push(v);
  }
  let survey_type = value(raw['Choose a survey'], 40);
  if (!SURVEY_TYPES.includes(survey_type)) {
    // The older form had no type question and only asked the discharge questions.
    survey_type = !survey_type && ratings.length ? 'Discharge' : 'Unspecified';
  }
  return {
    id,
    submitted_on,
    facility: value(raw['Freedom Facility'], 80) || 'Unassigned',
    survey_type,
    avg_score: ratings.length ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 1000) / 1000 : null,
    low_flag: ratings.some((r) => r <= 2),
    referring_facility: value(raw["Your Facility's Name"], 200) || null,
  };
}

export function normalizeSurveys(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('No survey rows');
  if (rows.length > MAX_SURVEY_ROWS) throw new Error('Too many survey rows');
  const byId = new Map();
  let skipped = 0;
  for (const raw of rows) {
    try { const r = normalizeSurvey(raw); byId.set(r.id, r); }
    catch { skipped++; }
  }
  return { rows: [...byId.values()], skipped };
}

export function surveyRecord(row) {
  const d = row.submitted_on instanceof Date ? row.submitted_on.toISOString().slice(0, 10) : String(row.submitted_on).slice(0, 10);
  return {
    id: row.id,
    date: d,
    facility: row.facility,
    survey_type: row.survey_type,
    avg_score: row.avg_score == null ? null : Number(row.avg_score),
    low_flag: Boolean(row.low_flag),
    referring_facility: row.referring_facility || '',
  };
}
