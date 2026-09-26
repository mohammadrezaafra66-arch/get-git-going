SET client_encoding TO 'UTF8';

-- ============================================================================
-- 596 — Torob Eye foundation
-- FIX A: product_computed_prices_public visible to service_role / supabase_admin
--        without changing SELECT list, settlement filter, or any price value.
-- BUILD: eye settings, runs, snapshots, notify, own-shop auto-report guard,
--        findings status trigger, DELETE revoke on sessions/report_logs.
-- Reverse: docs/verification/596-down.sql
-- ============================================================================

SET lock_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1) FIX A — view access only
-- Live cause: WHERE uid() IS NOT NULL. auth.uid() is NULL for service_role
-- and supabase_admin, so the scan's our-price hop sees 0 rows. Grants already
-- include service_role SELECT. RLS on the base table is not the blocker.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.product_computed_prices_public
WITH (security_invoker = true) AS
SELECT src.id,
       src.product_id,
       src.sale_price_type_id,
       src.pricing_rule_id,
       src.final_sale_price,
       src.rounded_sale_price,
       src.computed_at,
       src.source
  FROM (
    SELECT product_computed_prices.id,
           product_computed_prices.product_id,
           product_computed_prices.sale_price_type_id,
           product_computed_prices.pricing_rule_id,
           product_computed_prices.final_sale_price,
           product_computed_prices.rounded_sale_price,
           product_computed_prices.computed_at,
           product_computed_prices.source
      FROM public.product_computed_prices
     WHERE product_computed_prices.settlement_type_id IS NULL
  ) src
 WHERE (
         (auth.uid() IS NOT NULL AND NOT public.is_viewer_only(auth.uid()))
      OR current_user IN ('service_role', 'supabase_admin')
      OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
      OR COALESCE(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'role' = 'service_role'
       );

COMMENT ON VIEW public.product_computed_prices_public IS
  'Published cash prices (settlement_type_id IS NULL). 596: service_role/supabase_admin may read; pricing math unchanged.';

GRANT SELECT ON public.product_computed_prices_public TO authenticated;
GRANT SELECT ON public.product_computed_prices_public TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Eye settings on existing row
-- ---------------------------------------------------------------------------
ALTER TABLE public.torob_ops_settings
  ADD COLUMN IF NOT EXISTS eye_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.torob_ops_settings
  ADD COLUMN IF NOT EXISTS eye_delay_min_seconds integer NOT NULL DEFAULT 30;
ALTER TABLE public.torob_ops_settings
  ADD COLUMN IF NOT EXISTS eye_delay_max_seconds integer NOT NULL DEFAULT 60;
ALTER TABLE public.torob_ops_settings
  ADD COLUMN IF NOT EXISTS eye_cycle_hours integer NOT NULL DEFAULT 4;
ALTER TABLE public.torob_ops_settings
  ADD COLUMN IF NOT EXISTS eye_window_start_hour integer NOT NULL DEFAULT 8;
ALTER TABLE public.torob_ops_settings
  ADD COLUMN IF NOT EXISTS eye_window_end_hour integer NOT NULL DEFAULT 22;
ALTER TABLE public.torob_ops_settings
  ADD COLUMN IF NOT EXISTS eye_backoff_min_seconds integer NOT NULL DEFAULT 900;
ALTER TABLE public.torob_ops_settings
  ADD COLUMN IF NOT EXISTS eye_backoff_max_seconds integer NOT NULL DEFAULT 7200;
ALTER TABLE public.torob_ops_settings
  ADD COLUMN IF NOT EXISTS eye_block_alert_hours numeric NOT NULL DEFAULT 3;
ALTER TABLE public.torob_ops_settings
  ADD COLUMN IF NOT EXISTS eye_link_discovery_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.torob_ops_settings
  ADD COLUMN IF NOT EXISTS eye_bait_page_cap integer NOT NULL DEFAULT 2;
ALTER TABLE public.torob_ops_settings
  ADD COLUMN IF NOT EXISTS eye_owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 3) Runs + snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.torob_eye_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  status             text NOT NULL DEFAULT 'running'
                       CHECK (status IN ('running', 'completed', 'failed', 'blocked')),
  products_attempted integer NOT NULL DEFAULT 0,
  products_succeeded integer NOT NULL DEFAULT 0,
  products_failed    integer NOT NULL DEFAULT 0,
  products_skipped   integer NOT NULL DEFAULT 0,
  skip_reasons       jsonb NOT NULL DEFAULT '[]'::jsonb,
  block_events       jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.torob_offer_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid REFERENCES public.torob_eye_runs(id) ON DELETE SET NULL,
  product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  torob_url       text,
  seller_name     text,
  seller_shop_id  text,
  seller_shop_url text,
  price_toman     integer,
  availability    text,
  is_own_shop     boolean NOT NULL DEFAULT false,
  fetched_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_torob_offer_snapshots_product_fetched
  ON public.torob_offer_snapshots (product_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_torob_offer_snapshots_product_seller
  ON public.torob_offer_snapshots (product_id, seller_shop_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_torob_eye_runs_started
  ON public.torob_eye_runs (started_at DESC);

ALTER TABLE public.torob_ops_scan_runs
  ADD COLUMN IF NOT EXISTS skip_reasons jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.torob_eye_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.torob_offer_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS torob_eye_runs_select ON public.torob_eye_runs;
CREATE POLICY torob_eye_runs_select ON public.torob_eye_runs
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::app_role[]
    )
  );

DROP POLICY IF EXISTS torob_offer_snapshots_select ON public.torob_offer_snapshots;
CREATE POLICY torob_offer_snapshots_select ON public.torob_offer_snapshots
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::app_role[]
    )
  );

REVOKE ALL ON public.torob_eye_runs FROM PUBLIC;
REVOKE ALL ON public.torob_eye_runs FROM anon;
REVOKE ALL ON public.torob_offer_snapshots FROM PUBLIC;
REVOKE ALL ON public.torob_offer_snapshots FROM anon;
GRANT SELECT ON public.torob_eye_runs TO authenticated;
GRANT SELECT ON public.torob_offer_snapshots TO authenticated;
GRANT ALL ON public.torob_eye_runs TO service_role;
GRANT ALL ON public.torob_offer_snapshots TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Link assignment log (Stage 3 uses it; create now so the worker can write)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.torob_link_assignments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url         text,
  score       numeric,
  reasons     jsonb NOT NULL DEFAULT '[]'::jsonb,
  assigned    boolean NOT NULL DEFAULT false,
  source      text NOT NULL DEFAULT 'torob-eye',
  assigned_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.torob_link_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS torob_link_assignments_select ON public.torob_link_assignments;
CREATE POLICY torob_link_assignments_select ON public.torob_link_assignments
  FOR SELECT TO authenticated
  USING (
    public.has_any_role(
      auth.uid(),
      ARRAY['admin', 'manager', 'sales', 'accountant', 'viewer']::app_role[]
    )
  );
REVOKE ALL ON public.torob_link_assignments FROM PUBLIC;
REVOKE ALL ON public.torob_link_assignments FROM anon;
GRANT SELECT ON public.torob_link_assignments TO authenticated;
GRANT ALL ON public.torob_link_assignments TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Owner notify (DEFINER insert)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_torob_eye(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_reference_id uuid DEFAULT NULL,
  p_dedupe_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'notify_torob_eye: user required';
  END IF;

  IF p_dedupe_key IS NOT NULL THEN
    SELECT nq.id INTO v_id
      FROM public.notification_queue nq
     WHERE nq.user_id = p_user_id
       AND nq.type = 'system'
       AND nq.reference_type = p_dedupe_key
       AND nq.created_at >= now() - interval '24 hours'
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.notification_queue (
    user_id, title, body, type, reference_type, reference_id
  ) VALUES (
    p_user_id, p_title, p_body, 'system', COALESCE(p_dedupe_key, 'torob_eye'), p_reference_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$function$;

REVOKE ALL ON FUNCTION public.notify_torob_eye(uuid, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_torob_eye(uuid, text, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_torob_eye(uuid, text, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Auto-report cannot enable while own shops empty
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.torob_ops_guard_auto_report()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.auto_report_enabled IS TRUE
     AND NOT EXISTS (
       SELECT 1 FROM public.torob_ops_own_shops s
        WHERE s.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'auto_report_enabled requires at least one active row in torob_ops_own_shops';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_torob_ops_guard_auto_report ON public.torob_ops_settings;
CREATE TRIGGER trg_torob_ops_guard_auto_report
  BEFORE INSERT OR UPDATE OF auto_report_enabled ON public.torob_ops_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.torob_ops_guard_auto_report();

-- ---------------------------------------------------------------------------
-- 7) Findings: no client status PATCH; transitions in trigger
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS torob_ops_findings_write ON public.torob_ops_findings;

REVOKE INSERT, UPDATE, DELETE ON public.torob_ops_findings FROM authenticated;
GRANT SELECT ON public.torob_ops_findings TO authenticated;

CREATE OR REPLACE FUNCTION public.torob_ops_findings_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  allowed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF current_user IS DISTINCT FROM 'service_role'
     AND current_user IS DISTINCT FROM 'supabase_admin' THEN
    RAISE EXCEPTION 'torob_ops_findings status may only change through the server path';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  allowed := (
    (OLD.status IN ('cheaper_competitor','suspected_bait','manual_review','confirmed_bait','legitimate_competitor','cancelled')
     AND NEW.status IN ('cheaper_competitor','suspected_bait','manual_review','confirmed_bait','legitimate_competitor','cancelled'))
    OR (OLD.status = 'confirmed_bait' AND NEW.status = 'queued_for_report')
    OR (OLD.status = 'queued_for_report' AND NEW.status IN ('reporting','cancelled'))
    OR (OLD.status = 'reporting' AND NEW.status IN ('reported','report_failed'))
    OR (OLD.status = 'report_failed' AND NEW.status IN ('queued_for_report','cancelled'))
    OR (OLD.status = 'reported' AND NEW.status = 'cancelled')
  );

  IF NOT COALESCE(allowed, false) THEN
    RAISE EXCEPTION 'illegal torob_ops_findings status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_torob_ops_findings_status_guard ON public.torob_ops_findings;
CREATE TRIGGER trg_torob_ops_findings_status_guard
  BEFORE UPDATE OF status ON public.torob_ops_findings
  FOR EACH ROW
  EXECUTE FUNCTION public.torob_ops_findings_status_guard();

-- ---------------------------------------------------------------------------
-- 8) DELETE: explicit deny (no policy + revoke grant)
-- ---------------------------------------------------------------------------
REVOKE DELETE ON public.torob_ops_sessions FROM authenticated;
REVOKE DELETE ON public.torob_ops_report_logs FROM authenticated;

DROP POLICY IF EXISTS torob_ops_sessions_delete ON public.torob_ops_sessions;
CREATE POLICY torob_ops_sessions_delete ON public.torob_ops_sessions
  FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS torob_ops_report_logs_delete ON public.torob_ops_report_logs;
CREATE POLICY torob_ops_report_logs_delete ON public.torob_ops_report_logs
  FOR DELETE TO authenticated
  USING (false);
