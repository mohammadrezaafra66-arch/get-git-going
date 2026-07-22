-- =====================================================================
-- 132.1 - Manual daily staff performance metrics
-- =====================================================================
--
-- WHAT THIS MIGRATION CHANGES
--
--   NEW TABLE     public.staff_daily_performance_metrics
--   NEW INDEXES   unique (metric_date, staff_user_id) + lookup index
--   NEW TRIGGER   set updated_at on the new table only
--   NEW RPC       public.upsert_staff_daily_performance_metric(...)
--   NEW HELPER    public.manual_daily_metrics_totals(uuid, timestamptz)
--   RLS           enabled on the NEW table only
--
-- ADDITIVE ONLY. No existing table, column, function, trigger, view or row
-- is modified or deleted anywhere in this migration.
--
-- IMPORTANT - NOT WIRED INTO SCORING YET
--
-- public.calculate_employee_score(_employee_id uuid) is deliberately NOT
-- modified here. Its live definition is ~200 lines and it is invoked from
-- invoice and receipt-link triggers; rewriting it wholesale via
-- CREATE OR REPLACE risks silently corrupting employee scores.
--
-- Instead this migration ships manual_daily_metrics_totals(), which returns
-- the same five aggregates calculate_employee_score already computes from
-- call_logs and invoices. Hooking it in later is then a small additive edit
-- inside that function, of the shape:
--
--     SELECT * INTO _m FROM public.manual_daily_metrics_totals(_employee_id, _month_start);
--     _inbound_m := _inbound_m + _m.inbound_calls;
--     _outbound_m := _outbound_m + _m.outbound_calls;
--     _talk_m    := _talk_m    + _m.talk_minutes;
--     _sales_m   := _sales_m   + _m.sales_amount;
--
-- i.e. manual values ADD to the existing automatic sources; nothing is
-- replaced or removed. That edit must be made against a full dump of the
-- current function body and reviewed on its own.
--
-- ---------------------------------------------------------------------
-- PRE-CHECK
--
--   SELECT to_regclass('public.staff_daily_performance_metrics');  -- NULL
--
-- POST-CHECK
--
--   SELECT count(*) FROM public.staff_daily_performance_metrics;   -- 0
--   SELECT * FROM public.manual_daily_metrics_totals(
--            '00000000-0000-0000-0000-000000000000'::uuid, now() - interval '30 days');
--   -- expect a single all-zero row
--
-- ---------------------------------------------------------------------
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.upsert_staff_daily_performance_metric(
--     uuid, date, numeric, numeric, integer, integer, integer, text);
--   DROP FUNCTION IF EXISTS public.manual_daily_metrics_totals(uuid, timestamptz);
--   DROP TABLE IF EXISTS public.staff_daily_performance_metrics;  -- drops trigger too
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_daily_performance_metrics (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date          date NOT NULL,
  staff_user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sales_amount         numeric NOT NULL DEFAULT 0 CHECK (sales_amount >= 0),
  profit_amount        numeric NOT NULL DEFAULT 0,
  inbound_calls_count  integer NOT NULL DEFAULT 0 CHECK (inbound_calls_count  >= 0),
  outbound_calls_count integer NOT NULL DEFAULT 0 CHECK (outbound_calls_count >= 0),
  talk_time_minutes    integer NOT NULL DEFAULT 0 CHECK (talk_time_minutes    >= 0),
  notes                text NULL,
  created_by           uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by           uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_daily_perf_unique UNIQUE (metric_date, staff_user_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_daily_perf_user_date
  ON public.staff_daily_performance_metrics (staff_user_id, metric_date DESC);

-- Reuse the project's existing updated_at trigger function.
DROP TRIGGER IF EXISTS staff_daily_perf_updated_at ON public.staff_daily_performance_metrics;
CREATE TRIGGER staff_daily_perf_updated_at
  BEFORE UPDATE ON public.staff_daily_performance_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2) RLS - admin / manager / accountant only
-- ---------------------------------------------------------------------
ALTER TABLE public.staff_daily_performance_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sdpm_select_privileged ON public.staff_daily_performance_metrics;
CREATE POLICY sdpm_select_privileged
  ON public.staff_daily_performance_metrics
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(),
         ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]));

-- Insert limited to the last 5 days (today inclusive).
DROP POLICY IF EXISTS sdpm_insert_privileged ON public.staff_daily_performance_metrics;
CREATE POLICY sdpm_insert_privileged
  ON public.staff_daily_performance_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(),
      ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role])
    AND metric_date >= CURRENT_DATE - INTERVAL '5 days'
    AND metric_date <= CURRENT_DATE
  );

-- Update limited to the last 5 days as well.
DROP POLICY IF EXISTS sdpm_update_privileged ON public.staff_daily_performance_metrics;
CREATE POLICY sdpm_update_privileged
  ON public.staff_daily_performance_metrics
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(),
      ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role])
    AND metric_date >= CURRENT_DATE - INTERVAL '5 days'
  )
  WITH CHECK (
    public.has_any_role(auth.uid(),
      ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role])
    AND metric_date >= CURRENT_DATE - INTERVAL '5 days'
  );

-- Delete: admin only. Kept narrow on purpose - these rows feed scoring.
DROP POLICY IF EXISTS sdpm_delete_admin ON public.staff_daily_performance_metrics;
CREATE POLICY sdpm_delete_admin
  ON public.staff_daily_performance_metrics
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE ON public.staff_daily_performance_metrics TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Aggregation helper (used by the future scoring hook-in)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manual_daily_metrics_totals(
  p_employee_id uuid,
  p_from        timestamptz,
  OUT sales_amount   numeric,
  OUT profit_amount  numeric,
  OUT inbound_calls  integer,
  OUT outbound_calls integer,
  OUT talk_minutes   numeric
)
RETURNS record
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  SELECT COALESCE(SUM(sales_amount), 0),
         COALESCE(SUM(profit_amount), 0),
         COALESCE(SUM(inbound_calls_count), 0)::int,
         COALESCE(SUM(outbound_calls_count), 0)::int,
         COALESCE(SUM(talk_time_minutes), 0)::numeric
    INTO sales_amount, profit_amount, inbound_calls, outbound_calls, talk_minutes
    FROM public.staff_daily_performance_metrics
   WHERE staff_user_id = p_employee_id
     AND metric_date >= p_from::date;
END;
$function$;

REVOKE ALL ON FUNCTION public.manual_daily_metrics_totals(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manual_daily_metrics_totals(uuid, timestamptz) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) Upsert RPC - enforces role and the 5-day window server-side
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_staff_daily_performance_metric(
  p_staff_user_id        uuid,
  p_metric_date          date,
  p_sales_amount         numeric,
  p_profit_amount        numeric,
  p_inbound_calls_count  integer,
  p_outbound_calls_count integer,
  p_talk_time_minutes    integer,
  p_notes                text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  IF NOT public.has_any_role(v_uid,
       ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای ثبت عملکرد روزانه';
  END IF;

  v_is_admin := public.has_role(v_uid, 'admin');

  IF p_metric_date IS NULL OR p_metric_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'تاریخ نامعتبر است؛ ثبت برای آینده مجاز نیست';
  END IF;

  -- 5-day window. Admin may override for corrections.
  IF p_metric_date < CURRENT_DATE - INTERVAL '5 days' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'ویرایش فقط تا ۵ روز گذشته مجاز است';
  END IF;

  IF COALESCE(p_sales_amount,0) < 0
     OR COALESCE(p_inbound_calls_count,0) < 0
     OR COALESCE(p_outbound_calls_count,0) < 0
     OR COALESCE(p_talk_time_minutes,0) < 0 THEN
    RAISE EXCEPTION 'مقادیر نمی‌توانند منفی باشند';
  END IF;

  INSERT INTO public.staff_daily_performance_metrics AS m
    (metric_date, staff_user_id, sales_amount, profit_amount,
     inbound_calls_count, outbound_calls_count, talk_time_minutes,
     notes, created_by, updated_by)
  VALUES
    (p_metric_date, p_staff_user_id, COALESCE(p_sales_amount,0), COALESCE(p_profit_amount,0),
     COALESCE(p_inbound_calls_count,0), COALESCE(p_outbound_calls_count,0),
     COALESCE(p_talk_time_minutes,0), NULLIF(btrim(COALESCE(p_notes,'')), ''), v_uid, v_uid)
  ON CONFLICT (metric_date, staff_user_id) DO UPDATE
    SET sales_amount         = EXCLUDED.sales_amount,
        profit_amount        = EXCLUDED.profit_amount,
        inbound_calls_count  = EXCLUDED.inbound_calls_count,
        outbound_calls_count = EXCLUDED.outbound_calls_count,
        talk_time_minutes    = EXCLUDED.talk_time_minutes,
        notes                = EXCLUDED.notes,
        updated_by           = v_uid,
        updated_at           = now()
  RETURNING m.id INTO v_id;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'staff_daily_performance_metric', v_id::text,
          'staff_daily_metric_upserted',
          jsonb_build_object(
            'staff_user_id', p_staff_user_id,
            'metric_date', p_metric_date,
            'sales_amount', COALESCE(p_sales_amount,0),
            'profit_amount', COALESCE(p_profit_amount,0),
            'inbound_calls_count', COALESCE(p_inbound_calls_count,0),
            'outbound_calls_count', COALESCE(p_outbound_calls_count,0),
            'talk_time_minutes', COALESCE(p_talk_time_minutes,0)));

  -- Recalculate this employee's score. Never let a scoring failure roll back
  -- the metric itself.
  BEGIN
    PERFORM public.calculate_employee_score(p_staff_user_id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (v_uid, 'staff_daily_performance_metric', v_id::text,
            'score_recalc_failed', jsonb_build_object('error', SQLERRM));
  END;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_staff_daily_performance_metric(
  uuid, date, numeric, numeric, integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_staff_daily_performance_metric(
  uuid, date, numeric, numeric, integer, integer, integer, text) TO authenticated;

COMMIT;
