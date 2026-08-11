SET client_encoding='UTF8';

-- =====================================================================
-- Rollback for migration 268 (capital ceiling no longer overridable, D8-1).
--
-- Restores the definitions captured before 268 from pg_get_functiondef:
--   docs/verification/pre-268/capital-functions.sql
--
-- ⚠️ WARNING — WHAT RUNNING THIS COSTS YOU
--
-- 1. It re-opens the override at BOTH levels, which is exactly what the owner
--    decided (D8-1, option ب) must be closed: the day's final_capital and each
--    salesperson's ceiling become hand-editable again, gated only by a free-text
--    override_reason.
--
-- 2. It re-grants `anon` full DML on all seven capital tables INCLUDING
--    TRUNCATE. TRUNCATE is not subject to RLS at all, so this is a real hole,
--    not a theoretical one -- the same class of problem item 259 closed for
--    purchases.
--
-- 3. It restores TWO FATAL TYPE CASTS verbatim, because that is genuinely the
--    prior state:
--      ARRAY[...]::public.text[]           -> type "public.text[]" does not exist
--      ur.role = 'sales'::public.app_role  -> operator does not exist: text = app_role
--    (user_roles.role is text, not app_role.) With these restored,
--    save_salesperson_capital_allocations and
--    compute_salesperson_capital_allocations raise on EVERY call again -- which
--    is why salesperson_capital_allocations had 0 rows before 268. If you are
--    rolling back for some other reason and still want a working legacy path,
--    re-apply just the cast fixes from 268 by hand.
--
-- NOT reverted (deliberately): the historical rows. 268 never modified data --
-- the guard triggers are BEFORE INSERT/UPDATE only, so the 3 pre-existing
-- override rows dated 2026-07-21 were untouched and stay untouched.
--
--   docker cp docs/verification/268-down.sql afrakala-lan-db:/tmp/268-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/268-down.sql
-- =====================================================================

-- ── 1) remove the guards ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_daily_capital_not_overridable ON public.daily_capital_snapshots;
DROP TRIGGER IF EXISTS trg_allocation_not_overridable    ON public.salesperson_capital_allocations;
DROP FUNCTION IF EXISTS public.enforce_daily_capital_not_overridable();
DROP FUNCTION IF EXISTS public.enforce_allocation_not_overridable();

-- ── 2) restore save_daily_capital_snapshot WITH its override parameters ──
DROP FUNCTION IF EXISTS public.save_daily_capital_snapshot(date);

CREATE OR REPLACE FUNCTION public.save_daily_capital_snapshot(p_capital_date date, p_final_capital numeric, p_override_reason text DEFAULT NULL::text)
 RETURNS daily_capital_snapshots
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  s public.daily_capital_snapshots;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_capital_date IS NULL THEN
    RAISE EXCEPTION 'capital_date is required' USING ERRCODE = '22023';
  END IF;
  IF p_final_capital IS NULL OR p_final_capital < 0 THEN
    RAISE EXCEPTION 'final_capital must be >= 0' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO c FROM public.compute_daily_capital(p_capital_date);

  IF p_final_capital <> c.system_suggested_capital
     AND (p_override_reason IS NULL OR length(btrim(p_override_reason)) = 0) THEN
    RAISE EXCEPTION 'override_reason is required when final differs from suggested'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.daily_capital_snapshots(
    capital_date, system_suggested_capital, final_capital,
    total_receivables, overdue_receivables, due_today_receivables, future_receivables,
    total_payables, overdue_payables, due_today_payables, future_payables,
    input_id, formula_version, override_reason, approved_by, created_by
  ) VALUES (
    p_capital_date, c.system_suggested_capital, p_final_capital,
    c.total_receivables, c.overdue_receivables, c.due_today_receivables, c.future_receivables,
    c.total_payables, c.overdue_payables, c.due_today_payables, c.future_payables,
    c.input_id, c.formula_version, NULLIF(btrim(p_override_reason),''), auth.uid(), auth.uid()
  )
  RETURNING * INTO s;

  RETURN s;
END;
$function$;

-- ── 3) restore the two legacy allocation functions VERBATIM (broken casts included) ──
CREATE OR REPLACE FUNCTION public.compute_salesperson_capital_allocations(p_capital_snapshot_id uuid)
 RETURNS TABLE(capital_snapshot_id uuid, capital_date date, daily_final_capital numeric, salesperson_id uuid, score numeric, total_score numeric, system_suggested_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::public.text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.daily_capital_snapshots WHERE id = p_capital_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily capital snapshot not found' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(es.monthly_score), 0)
    INTO v_total
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'::public.app_role;

  RETURN QUERY
  SELECT
    v_snap.id,
    v_snap.capital_date,
    v_snap.final_capital,
    es.employee_id AS salesperson_id,
    es.monthly_score AS score,
    v_total AS total_score,
    CASE
      WHEN v_total > 0 THEN ROUND(v_snap.final_capital * (es.monthly_score / v_total))
      ELSE 0
    END AS system_suggested_amount
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'::public.app_role
  ORDER BY es.monthly_score DESC NULLS LAST;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_salesperson_capital_allocations(p_capital_snapshot_id uuid, p_allocations jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snap public.daily_capital_snapshots%ROWTYPE;
  v_total numeric;
  v_actor uuid := auth.uid();
  v_count integer := 0;
  v_item jsonb;
  v_sp uuid;
  v_final numeric;
  v_reason text;
  v_score numeric;
  v_suggested numeric;
  v_existing public.salesperson_capital_allocations%ROWTYPE;
  v_alloc_id uuid;
  v_action text;
BEGIN
  IF NOT public.has_any_role(v_actor, ARRAY['admin','manager','accountant']::public.text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_snap FROM public.daily_capital_snapshots WHERE id = p_capital_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily capital snapshot not found' USING ERRCODE = '22023';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'p_allocations must be a JSON array' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(es.monthly_score), 0)
    INTO v_total
  FROM public.employee_scores es
  JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'::public.app_role;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_sp := NULLIF(v_item->>'salesperson_id','')::uuid;
    v_final := COALESCE((v_item->>'final_amount')::numeric, 0);
    v_reason := NULLIF(v_item->>'override_reason','');

    IF v_sp IS NULL THEN
      RAISE EXCEPTION 'salesperson_id required' USING ERRCODE = '22023';
    END IF;
    IF v_final < 0 THEN
      RAISE EXCEPTION 'final_amount cannot be negative' USING ERRCODE = '22023';
    END IF;

    SELECT es.monthly_score INTO v_score
    FROM public.employee_scores es
    JOIN public.user_roles ur ON ur.user_id = es.employee_id AND ur.role = 'sales'::public.app_role
    WHERE es.employee_id = v_sp;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'user % is not a salesperson with score', v_sp USING ERRCODE = '22023';
    END IF;

    v_suggested := CASE
      WHEN v_total > 0 THEN ROUND(v_snap.final_capital * (v_score / v_total))
      ELSE 0
    END;

    IF ROUND(v_final) <> v_suggested AND v_reason IS NULL THEN
      RAISE EXCEPTION 'override_reason required when final_amount differs from suggested' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_existing
    FROM public.salesperson_capital_allocations
    WHERE capital_snapshot_id = p_capital_snapshot_id AND salesperson_id = v_sp;

    IF FOUND THEN
      UPDATE public.salesperson_capital_allocations
        SET score = v_score,
            total_score = v_total,
            system_suggested_amount = v_suggested,
            final_amount = v_final,
            override_reason = v_reason,
            status = 'approved',
            approved_by = v_actor,
            updated_at = now()
        WHERE id = v_existing.id
        RETURNING id INTO v_alloc_id;
      v_action := CASE WHEN ROUND(v_final) <> v_suggested THEN 'override' ELSE 'update' END;
    ELSE
      INSERT INTO public.salesperson_capital_allocations(
        capital_snapshot_id, capital_date, salesperson_id,
        score, total_score, system_suggested_amount, final_amount,
        override_reason, status, created_by, approved_by
      ) VALUES (
        p_capital_snapshot_id, v_snap.capital_date, v_sp,
        v_score, v_total, v_suggested, v_final,
        v_reason, 'approved', v_actor, v_actor
      ) RETURNING id INTO v_alloc_id;
      v_action := CASE WHEN ROUND(v_final) <> v_suggested THEN 'override' ELSE 'insert' END;
    END IF;

    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (v_actor, 'salesperson_capital_allocation', v_alloc_id, v_action,
            jsonb_build_object('salesperson_id', v_sp,
                               'system_suggested_amount', v_suggested,
                               'final_amount', v_final,
                               'override_reason', v_reason,
                               'capital_snapshot_id', p_capital_snapshot_id));

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- ── 4) restore the column comments to nothing ────────────────────────
COMMENT ON COLUMN public.daily_capital_snapshots.override_reason IS NULL;
COMMENT ON COLUMN public.salesperson_capital_allocations.override_reason IS NULL;

-- ── 5) restore the Supabase default grants (⚠️ re-opens the TRUNCATE hole) ──
GRANT ALL ON public.daily_capital_snapshots                 TO anon, authenticated;
GRANT ALL ON public.daily_capital_settings                  TO anon, authenticated;
GRANT ALL ON public.daily_capital_inputs                    TO anon, authenticated;
GRANT ALL ON public.salesperson_capital_allocations         TO anon, authenticated;
GRANT ALL ON public.customer_capital_allocations            TO anon, authenticated;
GRANT ALL ON public.salesperson_capital_allocations_dynamic TO anon, authenticated;
GRANT ALL ON public.customer_capital_allocations_dynamic    TO anon, authenticated;
