-- Execute in Neon SQL Editor before switching the Vercel app to this branch.
-- Existing Airtable IDs are preserved as tickets.id.
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY DEFAULT ('tkt_' || REPLACE(gen_random_uuid()::text, '-', '')),
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  contact_number TEXT NOT NULL DEFAULT '',
  facility TEXT NOT NULL,
  tool TEXT NOT NULL,
  subject TEXT NOT NULL,
  issue TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Medium',
  status TEXT NOT NULL DEFAULT 'Open',
  assigned_to TEXT NOT NULL DEFAULT '',
  date_submitted DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::date,
  resolved_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tickets_date_idx ON tickets(date_submitted DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tickets_status_idx ON tickets(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tickets_facility_idx ON tickets(facility) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ticket_events_ticket_idx ON ticket_events(ticket_id, occurred_at DESC);

-- Rate limits survive serverless function restarts.
CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INT NOT NULL DEFAULT 1,
  resets_at TIMESTAMPTZ NOT NULL
);
