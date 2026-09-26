SET client_encoding='UTF8';

-- ============================================================================
-- 589 — Didar deals PASS 2 additive schema
-- introducer, estimated_amount, history.field_name, wider history events
-- Safe: IF NOT EXISTS / DROP+ADD CHECK. No DROP TABLE. No data rewrite.
-- ============================================================================

SET lock_timeout = '60s';

-- Register introducer_person_id in live person_merge BEFORE the persons FK (328).
DO $reg$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef('public.person_merge(uuid,uuid,text)'::regprocedure) INTO def;
  IF def IS NULL THEN
    RAISE EXCEPTION 'person_merge missing';
  END IF;
  IF position('sales_interactions.introducer_person_id' in def) = 0 THEN
    IF position('sales_interactions.company_person_id' in def) > 0 THEN
      def := replace(
        def,
        '''sales_interactions.company_person_id'',                  ''generic'',',
        '''sales_interactions.company_person_id'',                  ''generic'','
        || E'\n    ''sales_interactions.introducer_person_id'',               ''generic'','
      );
    ELSIF position('sales_interactions.person_id' in def) > 0 THEN
      def := replace(
        def,
        '''sales_interactions.person_id'',                          ''generic'',',
        '''sales_interactions.person_id'',                          ''generic'','
        || E'\n    ''sales_interactions.introducer_person_id'',               ''generic'','
      );
    ELSE
      RAISE EXCEPTION 'live person_merge has no sales_interactions person key';
    END IF;
    EXECUTE def;
  END IF;
END
$reg$;

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS introducer_person_id uuid NULL REFERENCES public.persons(id);

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS estimated_amount numeric NULL;

ALTER TABLE public.sales_interactions
  DROP CONSTRAINT IF EXISTS sales_interactions_estimated_amount_check;
ALTER TABLE public.sales_interactions
  ADD CONSTRAINT sales_interactions_estimated_amount_check
  CHECK (estimated_amount IS NULL OR estimated_amount >= 0);

ALTER TABLE public.sales_interaction_history
  ADD COLUMN IF NOT EXISTS field_name text NULL;

ALTER TABLE public.sales_interaction_history
  DROP CONSTRAINT IF EXISTS sales_interaction_history_event_check;
ALTER TABLE public.sales_interaction_history
  ADD CONSTRAINT sales_interaction_history_event_check
  CHECK (event = ANY (ARRAY[
    'status'::text,
    'stage'::text,
    'pipeline'::text,
    'delete'::text,
    'restore'::text,
    'create'::text,
    'field'::text
  ]));

CREATE INDEX IF NOT EXISTS sales_interactions_introducer_idx
  ON public.sales_interactions (introducer_person_id)
  WHERE introducer_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS deal_related_users_profile_idx
  ON public.deal_related_users (profile_id);

CREATE INDEX IF NOT EXISTS sales_interaction_tags_tag_idx
  ON public.sales_interaction_tags (tag_id);
