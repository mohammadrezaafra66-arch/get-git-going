SET client_encoding='UTF8';

-- ============================================================================
-- 553 - call_ring_events.source (ami | cel | manual)
-- ============================================================================
-- 552 on LAN created call_ring_events without a source column (listener path
-- identity). Ingest and the browser select both need it.
-- ============================================================================

SET lock_timeout = '60s';

ALTER TABLE public.call_ring_events
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ami';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.call_ring_events'::regclass
      AND conname = 'call_ring_events_source_check'
  ) THEN
    ALTER TABLE public.call_ring_events
      ADD CONSTRAINT call_ring_events_source_check
      CHECK (source = ANY (ARRAY['ami'::text, 'cel'::text, 'manual'::text]));
  END IF;
END $$;

COMMENT ON COLUMN public.call_ring_events.source IS
  'ami = Asterisk Manager; cel = Channel Event Log poller; manual = test ingest.';

NOTIFY pgrst, 'reload schema';
