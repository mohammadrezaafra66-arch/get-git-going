SET client_encoding='UTF8';

-- ============================================================================
-- 590 — Didar deals PASS 2 rules
-- history create/field rows; per-stage required extra fields on stage change
-- ============================================================================

SET lock_timeout = '60s';

CREATE OR REPLACE FUNCTION public.sales_interactions_deal_history_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  actor uuid;
BEGIN
  IF NEW.kind IS DISTINCT FROM 'request' THEN
    RETURN NEW;
  END IF;

  actor := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  IF actor IS NULL THEN
    BEGIN
      actor := auth.uid();
    EXCEPTION WHEN OTHERS THEN
      actor := NULL;
    END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'create', NULL, NULL, NEW.title, actor, 'user');
    RETURN NEW;
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'title', OLD.title, NEW.title, actor, 'user');
  END IF;
  IF NEW.body IS DISTINCT FROM OLD.body THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'body', OLD.body, NEW.body, actor, 'user');
  END IF;
  IF NEW.salesperson_id IS DISTINCT FROM OLD.salesperson_id THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'owner', OLD.salesperson_id::text, NEW.salesperson_id::text, actor, 'user');
  END IF;
  IF NEW.estimated_amount IS DISTINCT FROM OLD.estimated_amount THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'amount', OLD.estimated_amount::text, NEW.estimated_amount::text, actor, 'user');
  END IF;
  IF NEW.introducer_person_id IS DISTINCT FROM OLD.introducer_person_id THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'introducer', OLD.introducer_person_id::text, NEW.introducer_person_id::text, actor, 'user');
  END IF;
  IF NEW.company_person_id IS DISTINCT FROM OLD.company_person_id THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'company', OLD.company_person_id::text, NEW.company_person_id::text, actor, 'user');
  END IF;
  IF NEW.expected_close_on IS DISTINCT FROM OLD.expected_close_on THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'expected_close', OLD.expected_close_on::text, NEW.expected_close_on::text, actor, 'user');
  END IF;
  IF NEW.register_time IS DISTINCT FROM OLD.register_time THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'register_time', OLD.register_time::text, NEW.register_time::text, actor, 'user');
  END IF;
  IF NEW.acquaintance_id IS DISTINCT FROM OLD.acquaintance_id THEN
    INSERT INTO public.sales_interaction_history
      (interaction_id, event, field_name, from_value, to_value, actor_id, source)
    VALUES (NEW.id, 'field', 'acquaintance', OLD.acquaintance_id::text, NEW.acquaintance_id::text, actor, 'user');
  END IF;

  -- stage/pipeline/status/delete/restore already written by 585 trigger; skip duplicates.
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sales_interactions_deal_history_fields ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_deal_history_fields
  AFTER INSERT OR UPDATE ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sales_interactions_deal_history_fields();
