SET client_encoding='UTF8';

-- ============================================================================
-- 547 - notify assignee when sales_interactions.salesperson_id is set/changed.
-- ============================================================================
--
-- Chosen path: AFTER INSERT OR UPDATE TRIGGER on public.sales_interactions
-- (function notify_sales_interaction_assigned). This covers RPC create/update
-- and any direct table write; body authz stays in 546 RPCs / RLS.
--
-- Also widens notification_queue_type_check to ADD 'sales_interaction_assigned'
-- while keeping ALL prior types from migration 493:
--   stock_alert, system, task, payment, sale_price_change, birthday,
--   quote_rejected, daily_accrual_summary
--
-- Insert shape matches 224 (quote_rejected) / 126 (sale_price_change):
--   user_id, title, body, type, reference_type, reference_id
--
-- Reverse: docs/research/sales-desk-9-needs/orchestration/547-down.sql
-- ============================================================================

SET lock_timeout = '60s';

-- ----------------------------------------------------------------------------
-- 1. Widen type CHECK (additive only; safe for existing rows)
-- ----------------------------------------------------------------------------
ALTER TABLE public.notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_type_check;

ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_type_check
  CHECK (type = ANY (ARRAY[
    'stock_alert'::text,
    'system'::text,
    'task'::text,
    'payment'::text,
    'sale_price_change'::text,
    'birthday'::text,
    'quote_rejected'::text,
    'daily_accrual_summary'::text,
    'sales_interaction_assigned'::text
  ]));

COMMENT ON CONSTRAINT notification_queue_type_check ON public.notification_queue IS
  'Prior types from 493 plus sales_interaction_assigned (migration 547).';

-- ----------------------------------------------------------------------------
-- 2. Trigger function (SECURITY DEFINER so it can enqueue for another user)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_sales_interaction_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_title text;
  v_body  text;
  v_person text;
BEGIN
  -- Fire when salesperson_id is non-null on INSERT, or changes on UPDATE.
  IF NEW.salesperson_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.salesperson_id IS NOT DISTINCT FROM OLD.salesperson_id THEN
    RETURN NEW;
  END IF;

  -- Do not notify the actor about assigning themself.
  IF NEW.salesperson_id IS NOT DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.display_name), ''), p.id::text)
    INTO v_person
    FROM public.persons p
   WHERE p.id = NEW.person_id;

  v_title := 'تعامل فروش به شما ارجاع شد';
  v_body := concat_ws(E'\n',
    'یک تعامل فروش (' || COALESCE(NEW.kind, '—') || ') به شما ارجاع شد.',
    'شخص: ' || COALESCE(v_person, '—'),
    CASE WHEN NEW.title IS NOT NULL AND btrim(NEW.title) <> ''
         THEN 'عنوان: ' || NEW.title ELSE NULL END,
    'شناسه: ' || NEW.id::text
  );

  -- Live catalog: notification_queue.reference_id is uuid (not text).
  INSERT INTO public.notification_queue (
    user_id, title, body, type, reference_type, reference_id
  )
  VALUES (
    NEW.salesperson_id,
    v_title,
    v_body,
    'sales_interaction_assigned',
    'sales_interaction',
    NEW.id
  );

  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.notify_sales_interaction_assigned() IS
  'Enqueues notification_queue row when sales_interactions.salesperson_id is set/changed. Migration 547.';

REVOKE ALL ON FUNCTION public.notify_sales_interaction_assigned() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_sales_interaction_assigned() FROM anon;

DROP TRIGGER IF EXISTS trg_notify_sales_interaction_assigned ON public.sales_interactions;
CREATE TRIGGER trg_notify_sales_interaction_assigned
  AFTER INSERT OR UPDATE OF salesperson_id ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_sales_interaction_assigned();

-- ----------------------------------------------------------------------------
-- 3. Assertions
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  _def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO _def
    FROM pg_constraint
   WHERE conname = 'notification_queue_type_check'
     AND conrelid = 'public.notification_queue'::regclass;

  IF _def IS NULL OR position('sales_interaction_assigned' IN _def) = 0 THEN
    RAISE EXCEPTION '547: CHECK missing sales_interaction_assigned: %', _def;
  END IF;

  IF position('daily_accrual_summary' IN _def) = 0
     OR position('quote_rejected' IN _def) = 0 THEN
    RAISE EXCEPTION '547: CHECK lost prior types: %', _def;
  END IF;

  IF to_regprocedure('public.notify_sales_interaction_assigned()') IS NULL THEN
    RAISE EXCEPTION '547: notify_sales_interaction_assigned missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_notify_sales_interaction_assigned'
       AND tgrelid = 'public.sales_interactions'::regclass
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '547: trigger trg_notify_sales_interaction_assigned missing';
  END IF;

  RAISE NOTICE '547 OK: type check widened; assign notify trigger installed';
END
$do$;
