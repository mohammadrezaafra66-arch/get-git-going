SET client_encoding='UTF8';

-- ============================================================================
-- 567 - deal_lost_reasons + lost_reason_* on sales_interactions (C8)
-- ============================================================================
-- Seed ONLY «سایر» via Unicode escape (AGENTS.md / Node Buffer apply).
-- Trigger: transition TO lost requires lost_reason_id; if title is «سایر»
-- require non-empty lost_reason_other. MESSAGE='LOST_REASON_REQUIRED'.
-- Deactivate never delete.
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/567_deal_lost_reasons.sql
-- ============================================================================

SET lock_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.deal_lost_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.deal_lost_reasons IS
  'Catalog of deal-lost reasons. Deactivate never delete. Migration 567.';

-- Seed «سایر» (U+0633 U+0627 U+06CC U+0631) — ASCII-only source
INSERT INTO public.deal_lost_reasons (title, is_active, sort_order)
SELECT U&'\0633\0627\06CC\0631', true, 0
WHERE NOT EXISTS (
  SELECT 1 FROM public.deal_lost_reasons WHERE title = U&'\0633\0627\06CC\0631'
);

ALTER TABLE public.sales_interactions
  ADD COLUMN IF NOT EXISTS lost_reason_id uuid NULL
    REFERENCES public.deal_lost_reasons(id),
  ADD COLUMN IF NOT EXISTS lost_reason_note text NULL,
  ADD COLUMN IF NOT EXISTS lost_reason_other text NULL;

CREATE INDEX IF NOT EXISTS sales_interactions_lost_reason_id_idx
  ON public.sales_interactions (lost_reason_id)
  WHERE lost_reason_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sales_interactions_require_lost_reason()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_title text;
BEGIN
  -- Enforce on transition TO lost (INSERT with status=lost, or UPDATE status→lost).
  IF NEW.status = 'lost'
     AND (
       TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status)
     ) THEN
    IF NEW.lost_reason_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LOST_REASON_REQUIRED';
    END IF;

    SELECT r.title INTO v_title
      FROM public.deal_lost_reasons r
     WHERE r.id = NEW.lost_reason_id;

    IF v_title IS NOT DISTINCT FROM U&'\0633\0627\06CC\0631'
       AND (NEW.lost_reason_other IS NULL OR btrim(NEW.lost_reason_other) = '') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LOST_REASON_REQUIRED';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sales_interactions_require_lost_reason() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_interactions_require_lost_reason() FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_interactions_require_lost_reason() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_interactions_require_lost_reason() TO service_role;

DROP TRIGGER IF EXISTS trg_sales_interactions_require_lost_reason ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_require_lost_reason
  BEFORE INSERT OR UPDATE ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_require_lost_reason();

-- RLS: SELECT for authenticated; INSERT/UPDATE for admin/manager
ALTER TABLE public.deal_lost_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_lost_reasons_select ON public.deal_lost_reasons;
CREATE POLICY deal_lost_reasons_select ON public.deal_lost_reasons
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS deal_lost_reasons_insert ON public.deal_lost_reasons;
CREATE POLICY deal_lost_reasons_insert ON public.deal_lost_reasons
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

DROP POLICY IF EXISTS deal_lost_reasons_update ON public.deal_lost_reasons;
CREATE POLICY deal_lost_reasons_update ON public.deal_lost_reasons
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
  );

REVOKE ALL ON TABLE public.deal_lost_reasons FROM PUBLIC;
REVOKE ALL ON TABLE public.deal_lost_reasons FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.deal_lost_reasons TO authenticated;
GRANT ALL ON TABLE public.deal_lost_reasons TO service_role;
