-- Phase DB-A1: interaction events — session dedup + new event type
ALTER TABLE public.product_interaction_events
  ADD COLUMN IF NOT EXISTS search_session_id uuid NULL;

ALTER TABLE public.product_interaction_events
  DROP CONSTRAINT IF EXISTS product_interaction_events_event_type_check;

ALTER TABLE public.product_interaction_events
  ADD CONSTRAINT product_interaction_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'search_result_viewed'::text,
    'price_checked'::text,
    'chart_opened'::text,
    'product_details_opened'::text,
    'board_price_viewed'::text,
    'sales_text_copied'::text
  ]));

CREATE UNIQUE INDEX IF NOT EXISTS uq_pie_session_dedup
  ON public.product_interaction_events (user_id, product_id, search_session_id, event_type)
  WHERE search_session_id IS NOT NULL;
