-- =========================================================================
-- DB-A1 — product_interaction_events: search session + new event type + dedup
-- =========================================================================
-- Adds:
--   1) search_session_id uuid  — groups all events of a single sales search
--      session so downstream reports can de-duplicate per-session noise.
--   2) 'sales_text_copied' to the event_type CHECK constraint.
--   3) A partial unique index that de-duplicates one (user, product, session,
--      event_type) tuple. Client inserts that violate it get 23505, which the
--      server function treats as success (idempotent tracking).
--
-- Self-host: file only. Owner applies on the server. Nothing runs here.
-- =========================================================================

-- 1) New column ---------------------------------------------------------------
ALTER TABLE public.product_interaction_events
  ADD COLUMN IF NOT EXISTS search_session_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_pie_search_session_created
  ON public.product_interaction_events(search_session_id, created_at DESC);

-- 2) Extend event_type CHECK to include 'sales_text_copied' -------------------
ALTER TABLE public.product_interaction_events
  DROP CONSTRAINT IF EXISTS product_interaction_events_event_type_check;

ALTER TABLE public.product_interaction_events
  ADD CONSTRAINT product_interaction_events_event_type_check
  CHECK (event_type IN (
    'search_result_viewed',
    'price_checked',
    'chart_opened',
    'product_details_opened',
    'board_price_viewed',
    'sales_text_copied'
  ));

-- 3) Dedup unique index (only when a session id is present) -------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_pie_dedup_session_event
  ON public.product_interaction_events(user_id, product_id, search_session_id, event_type)
  WHERE search_session_id IS NOT NULL AND user_id IS NOT NULL;

-- NOTE: after applying on the server, run: supabase gen types → regenerate types.ts.
