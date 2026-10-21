-- Preserve all historical fields in the CSV migration without discarding unexpected values.
-- Run on the production-bound Neon branch before importing legacy records.
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS legacy_ticket_number integer;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS legacy_source_raw jsonb;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS imported_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS tickets_legacy_number_idx
  ON public.tickets(legacy_ticket_number) WHERE legacy_ticket_number IS NOT NULL;
