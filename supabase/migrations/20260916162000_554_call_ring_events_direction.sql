SET client_encoding='UTF8';

-- ============================================================================
-- 554 - call_ring_events.direction (inbound | outbound)
-- ============================================================================

SET lock_timeout = '60s';

ALTER TABLE public.call_ring_events
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'inbound';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.call_ring_events'::regclass
      AND conname = 'call_ring_events_direction_check'
  ) THEN
    ALTER TABLE public.call_ring_events
      ADD CONSTRAINT call_ring_events_direction_check
      CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text]));
  END IF;
END $$;

COMMENT ON COLUMN public.call_ring_events.direction IS
  'inbound = queue/trunk ringing the extension; outbound = extension dialed out.';

-- Dedupe per call leg includes direction (same linkedid can theoretically differ).
DROP INDEX IF EXISTS call_ring_events_linkedid_extension_uidx;
DROP INDEX IF EXISTS uq_call_ring_events_linkedid_extension;

CREATE UNIQUE INDEX IF NOT EXISTS call_ring_events_linkedid_ext_dir_uidx
  ON public.call_ring_events (linkedid, extension, direction)
  WHERE linkedid IS NOT NULL AND extension IS NOT NULL;

NOTIFY pgrst, 'reload schema';
