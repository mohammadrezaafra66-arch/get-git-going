SET client_encoding='UTF8';

-- ============================================================================
-- 548 - lock sales_interactions.author_id on UPDATE (non-admin/manager)
-- ============================================================================
--
-- Security finding (C6): UPDATE RLS allows assignee (salesperson_id = auth.uid())
-- to change author_id → authorship theft. INSERT WITH CHECK forces
-- author_id = auth.uid(), but nothing kept that invariant after first write.
--
-- Fix: BEFORE UPDATE trigger raises if NEW.author_id IS DISTINCT FROM
-- OLD.author_id unless the actor has admin/manager. Enforced for
-- current_user = 'authenticated' so service_role / table-owner repair
-- paths still work. Also REVOKE DELETE from authenticated (no DELETE
-- policy intended; grant was excess).
--
-- Reverse: docs/research/sales-desk-9-needs/orchestration/548-down.sql
-- ============================================================================

SET lock_timeout = '60s';

CREATE OR REPLACE FUNCTION public.tg_sales_interactions_lock_author_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    -- Only gate PostgREST / authenticated sessions. Superuser / service_role /
    -- table-owner sessions (current_user <> 'authenticated') may still repair.
    IF current_user = 'authenticated'
       AND NOT public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    THEN
      RAISE EXCEPTION
        'sales_interactions.author_id is immutable for non-admin/manager (migration 548)'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_sales_interactions_lock_author_id() IS
  'BEFORE UPDATE: reject author_id changes unless admin/manager. Migration 548.';

DROP TRIGGER IF EXISTS trg_sales_interactions_lock_author_id ON public.sales_interactions;
CREATE TRIGGER trg_sales_interactions_lock_author_id
  BEFORE UPDATE ON public.sales_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_sales_interactions_lock_author_id();

REVOKE EXECUTE ON FUNCTION public.tg_sales_interactions_lock_author_id()
  FROM PUBLIC, anon, authenticated;

-- Defense-in-depth: no DELETE policy; drop excess DELETE grant from 545.
REVOKE DELETE ON TABLE public.sales_interactions FROM authenticated;

DO $assert$
DECLARE
  _tg text;
  _del boolean;
BEGIN
  SELECT tgname INTO _tg
    FROM pg_trigger
   WHERE tgrelid = 'public.sales_interactions'::regclass
     AND tgname = 'trg_sales_interactions_lock_author_id'
     AND NOT tgisinternal;
  IF _tg IS NULL THEN
    RAISE EXCEPTION '548: lock_author_id trigger missing';
  END IF;

  SELECT has_table_privilege('authenticated', 'public.sales_interactions', 'DELETE')
    INTO _del;
  IF _del THEN
    RAISE EXCEPTION '548: authenticated still has DELETE on sales_interactions';
  END IF;
END
$assert$;
