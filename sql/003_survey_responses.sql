-- 5 Star Survey report (survey-report.html). The API also creates these tables
-- on the first upload, so running this by hand is optional.
-- Only summary fields are stored: no respondent names, comments or patient fields.
CREATE TABLE IF NOT EXISTS survey_responses (
  id TEXT PRIMARY KEY,
  submitted_on DATE NOT NULL,
  facility TEXT NOT NULL,
  survey_type TEXT NOT NULL,
  avg_score NUMERIC(4,3),
  low_flag BOOLEAN NOT NULL DEFAULT FALSE,
  referring_facility TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS survey_responses_date_idx ON survey_responses(submitted_on);

CREATE TABLE IF NOT EXISTS survey_imports (
  id BIGSERIAL PRIMARY KEY,
  file_name TEXT NOT NULL DEFAULT '',
  row_count INTEGER NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
