SET client_encoding='UTF8';

-- ============================================================================
-- 586 — quote events advance / close open deals (D7 D8)
-- Does not replace sales_quotes_validate_status or update_sales_quote_status.
-- ============================================================================

SET lock_timeout = '60s';

CREATE OR REPLACE FUNCTION public.sales_quotes_advance_linked_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  deal public.sales_interactions%ROWTYPE;
  cur_ord integer;
  tgt_id uuid;
  tgt_ord integer;
  ev text;
  actor uuid := auth.uid();
BEGIN
  IF NEW.interaction_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO deal
    FROM public.sales_interactions
   WHERE id = NEW.interaction_id
     AND kind = 'request';
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status = 'accepted'
     AND OLD.status IS DISTINCT FROM 'accepted' THEN
    PERFORM set_config('afrakala.change_source', 'auto_quote_accepted', true);
    IF deal.deleted_at IS NULL AND deal.status = 'open' THEN
      UPDATE public.sales_interactions
         SET status = 'won',
             won_by = COALESCE(actor, won_by)
       WHERE id = deal.id;
    ELSE
      INSERT INTO public.sales_interaction_history
        (interaction_id, event, from_value, to_value, actor_id, source)
      VALUES (deal.id, 'status', deal.status, deal.status, actor, 'auto_quote_accepted');
    END IF;
    RETURN NEW;
  END IF;

  IF deal.deleted_at IS NOT NULL OR deal.status IS DISTINCT FROM 'open' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    ev := 'quote_created';
  ELSIF TG_OP = 'UPDATE'
        AND NEW.status = 'sent'
        AND OLD.status IS DISTINCT FROM 'sent' THEN
    ev := 'quote_sent';
  ELSE
    RETURN NEW;
  END IF;

  PERFORM set_config('afrakala.change_source',
    CASE ev WHEN 'quote_created' THEN 'auto_quote_created' ELSE 'auto_quote_sent' END,
    true);

  SELECT s.sort_order INTO cur_ord
    FROM public.sales_pipeline_stages s
   WHERE s.id = deal.stage_id;

  SELECT s.id, s.sort_order INTO tgt_id, tgt_ord
    FROM public.sales_pipeline_stages s
   WHERE s.pipeline_id = deal.pipeline_id
     AND s.auto_event = ev
     AND s.is_active
   ORDER BY s.sort_order
   LIMIT 1;

  IF tgt_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF cur_ord IS NOT NULL AND tgt_ord <= cur_ord THEN
    RETURN NEW;
  END IF;

  UPDATE public.sales_interactions
     SET stage_id = tgt_id
   WHERE id = deal.id;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_quotes_advance_linked_deal ON public.sales_quotes;
CREATE TRIGGER trg_sales_quotes_advance_linked_deal
  AFTER INSERT OR UPDATE OF status ON public.sales_quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_quotes_advance_linked_deal();

REVOKE ALL ON FUNCTION public.sales_quotes_advance_linked_deal() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sales_quotes_advance_linked_deal() FROM anon;
GRANT EXECUTE ON FUNCTION public.sales_quotes_advance_linked_deal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_quotes_advance_linked_deal() TO service_role;
