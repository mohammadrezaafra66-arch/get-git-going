SET client_encoding='UTF8';

-- 454 — the overdue credit gate reads live receivables instead of an empty table.
--
-- WHAT WAS WRONG. Two RPCs decide whether a customer is overdue, and both asked
-- `customer_credit_profile`:
--
--   * `calculate_customer_realtime_credit` — `LEFT JOIN customer_credit_profile cp`,
--     then `IF v_has_overdue THEN` return `binding_constraint = 'overdue'`;
--   * `get_customer_dynamic_credit` — reads `p.has_overdue` / `p.overdue_since`, which
--     `create_sales_quote_with_items` then gates on.
--
-- `customer_credit_profile` holds **0 rows**, so `has_overdue` was always false and the
-- gate had never once fired. Measured 2026-09-05: 91 customers, 0 profile rows, while
-- `vw_customer_receivables` reported 7 overdue rows across 3 customers holding
-- 978,500,000 rial of genuinely overdue balance.
--
-- The gate itself was never missing. `create_sales_quote_with_items` already raises
-- 'مشتری مانده معوق دارد...' and already demands an `overdue_salesperson_commitment`
-- exception with a settlement deadline. It was reading a dead sensor.
--
-- WHY NOT REPAIR THE TABLE INSTEAD. Migration 331 gutted the bodies of both writers
-- (`update_customer_overdue_status`, `recalculate_settlement_score`) when the `invoices`
-- table was dropped: the first now hardcodes `v_overdue_since := NULL`, the second scores
-- an empty loop. They are still callable. Backfilling or re-enabling that table would
-- therefore write rows of hardcoded `has_overdue = false` — a populated table of wrong
-- answers, which is strictly worse than an empty one. This migration does not touch
-- `customer_credit_profile` at all, and the reads that feed `outstanding_balance`,
-- `total_purchases` and `settlement_score` are left exactly as they were.
--
-- WHAT REPLACES IT. `can_issue_customer_invoice(uuid)` already existed, already computed
-- exactly this over `vw_customer_receivables`, and was called by nothing. It is reused
-- rather than copied: a second definition of the same check is the failure mode this
-- project pays for most.
--
--   is_overdue := due_date IS NOT NULL
--                 AND due_date < tehran_today()
--                 AND outstanding_amount > 0
--
-- ORDER MATTERS — READ BEFORE MOVING THESE CALLS. `vw_customer_receivables` ends in
-- `WHERE auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid())`. That guard does not
-- raise; it returns **zero rows**, and zero rows read as "not overdue". It therefore
-- FAILS OPEN. Every read added below sits *after* the caller's role check has already
-- raised for an unauthenticated or unauthorised caller, so the guard can never be the
-- thing that decides the answer. Do not hoist any of these reads above a role check, and
-- do not call `can_issue_customer_invoice` from a context that has not authenticated.
--
-- The same reasoning is why `can_issue_customer_invoice` gains its own role check here.
-- It is SECURITY DEFINER and had none, so an authenticated `viewer` — or, before the
-- REVOKE below, `anon` — got `can_issue = true` for every customer on earth. Harmless
-- while nothing called it; not harmless now that it is the source of truth for a credit
-- gate. It fails closed after this migration.

-- ---------------------------------------------------------------------------
-- 1. Harden the shared check, and stop it failing open.
--    CREATE OR REPLACE preserves existing grants, so the REVOKE below is what
--    actually closes the anonymous path; it is not restored by the replace.
--    Marked STABLE because it only reads, and because it is now called from
--    `calculate_customer_realtime_credit`, which is itself STABLE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_issue_customer_invoice(p_customer_id uuid)
 RETURNS TABLE(can_issue boolean, customer_id uuid, overdue_amount numeric, overdue_count integer, oldest_due_date date, reason text)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric := 0;
  v_count  integer := 0;
  v_oldest date;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id الزامی است' USING ERRCODE = '22023';
  END IF;

  -- 454: added. Without this the underlying view's fail-open guard decided the answer
  -- for any caller who was not allowed to see receivables. The role set is the union of
  -- the two callers' own checks, so neither caller's behaviour changes.
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(r.outstanding_amount),0)::numeric,
         COUNT(*)::int,
         MIN(r.due_date)
    INTO v_amount, v_count, v_oldest
  FROM public.vw_customer_receivables r
  WHERE r.customer_id = p_customer_id
    AND r.is_overdue = true
    AND r.outstanding_amount > 0;

  IF v_count = 0 THEN
    RETURN QUERY SELECT true, p_customer_id, 0::numeric, 0, NULL::date, NULL::text;
  ELSE
    RETURN QUERY SELECT
      false,
      p_customer_id,
      v_amount,
      v_count,
      v_oldest,
      'این مشتری دارای مانده معوق است و تا زمان تسویه، امکان صدور فاکتور یا پیش‌فاکتور جدید ندارد.'::text;
  END IF;
END
$function$;

-- `anon` held EXECUTE on this SECURITY DEFINER function. Nothing called it, so nothing
-- was exposed; it is closed here before it becomes load-bearing. `get_customer_dynamic_credit`
-- already had no anon grant — this brings the shared check to the same posture.
--
-- TWO REVOKES, NOT ONE, and the first is the one that does the work. Migration 393 measured
-- this and the measurement held again here: the ACL was
--   {=X/supabase_admin, supabase_admin=X, anon=X, authenticated=X, service_role=X, postgres=X}
-- Revoking from `anon` alone removes the `anon=X` entry and leaves the bare `=X` — the grant
-- to PUBLIC that `acldefault()` puts on every new function — so `has_function_privilege('anon', …)`
-- stays TRUE. The first draft of this migration did exactly that and the proof caught it.
-- The re-GRANTs are no-ops on this database (those entries already exist explicitly) and are
-- written out so the statement is safe to apply where they do not.
REVOKE EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. The realtime credit RPC. Only the overdue source moves; `credit_limit` still
--    comes from `customer_credit_profile` exactly as before, and the whole
--    allocation/score path below the gate is untouched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_customer_realtime_credit(p_customer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_responsible uuid;
  v_credit_limit numeric;
  v_has_overdue boolean;
  v_capital_date date;
  v_capital_setting_id uuid;
  v_allocated_capital numeric;
  v_score jsonb;
  v_weighted numeric;
  v_params_evaluated int;
  v_params_active int;
  v_breakdown jsonb;
  v_sum_scores numeric;
  v_self_snapshot numeric := 0;
  v_share_ratio numeric;
  v_raw_allocation numeric := 0;
  v_final_limit numeric := 0;
  v_binding text := 'formula';
  v_is_stale boolean := false;
BEGIN
  IF v_caller IS NULL OR NOT (
    public.has_role(v_caller, 'admin')
    OR public.has_role(v_caller, 'manager')
    OR public.has_role(v_caller, 'accountant')
  ) THEN
    RAISE EXCEPTION 'Forbidden: requires admin, manager, or accountant';
  END IF;

  -- 454: `cp.has_overdue` was read here and was always false (0 rows). `credit_limit`
  -- still comes from the same LEFT JOIN and is unchanged.
  SELECT c.responsible_id,
         COALESCE(cp.credit_limit, 0)
  INTO v_responsible, v_credit_limit
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile cp ON cp.customer_id = c.id
  WHERE c.id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found: %', p_customer_id;
  END IF;

  -- 454: overdue now comes from live receivables. This sits below the role check above
  -- on purpose — see the header note on the view's fail-open guard.
  SELECT NOT ci.can_issue
  INTO v_has_overdue
  FROM public.can_issue_customer_invoice(p_customer_id) ci;

  IF v_has_overdue THEN
    RETURN jsonb_build_object(
      'weighted_score', 0, 'params_evaluated', 0, 'params_active', 0,
      'final_limit', 0, 'raw_allocation', 0, 'credit_limit', v_credit_limit,
      'binding_constraint', 'overdue', 'capital_date_used', NULL,
      'is_capital_stale', false, 'salesperson_allocated_capital', 0,
      'share_ratio', 0, 'breakdown', '[]'::jsonb
    );
  END IF;

  IF v_responsible IS NULL THEN
    RETURN jsonb_build_object(
      'weighted_score', 0, 'params_evaluated', 0, 'params_active', 0,
      'final_limit', 0, 'raw_allocation', 0, 'credit_limit', v_credit_limit,
      'binding_constraint', 'no_salesperson', 'capital_date_used', NULL,
      'is_capital_stale', false, 'salesperson_allocated_capital', 0,
      'share_ratio', 0, 'breakdown', '[]'::jsonb
    );
  END IF;

  -- Latest salesperson capital snapshot via JOIN to daily_capital_settings
  SELECT dcs.capital_date, sca.capital_setting_id, sca.allocated_capital
  INTO v_capital_date, v_capital_setting_id, v_allocated_capital
  FROM public.salesperson_capital_allocations_dynamic sca
  JOIN public.daily_capital_settings dcs ON dcs.id = sca.capital_setting_id
  WHERE sca.salesperson_id = v_responsible
  ORDER BY dcs.capital_date DESC, sca.created_at DESC
  LIMIT 1;

  IF v_capital_date IS NULL THEN
    v_score := public.calculate_dynamic_score('customer', p_customer_id, CURRENT_DATE);
    RETURN jsonb_build_object(
      'weighted_score', COALESCE((v_score->>'weighted_score')::numeric, 0),
      'params_evaluated', COALESCE((v_score->>'params_evaluated')::int, 0),
      'params_active', COALESCE((v_score->>'params_active')::int, 0),
      'final_limit', 0, 'raw_allocation', 0, 'credit_limit', v_credit_limit,
      'binding_constraint', 'no_capital', 'capital_date_used', NULL,
      'is_capital_stale', false, 'salesperson_allocated_capital', 0,
      'share_ratio', 0, 'breakdown', COALESCE(v_score->'breakdown', '[]'::jsonb)
    );
  END IF;

  v_is_stale := v_capital_date < CURRENT_DATE;

  v_score := public.calculate_dynamic_score('customer', p_customer_id, v_capital_date);
  v_weighted         := COALESCE((v_score->>'weighted_score')::numeric, 0);
  v_params_evaluated := COALESCE((v_score->>'params_evaluated')::int, 0);
  v_params_active    := COALESCE((v_score->>'params_active')::int, 0);
  v_breakdown        := COALESCE(v_score->'breakdown', '[]'::jsonb);

  -- Peers' snapshot sum within the same capital setting
  SELECT COALESCE(SUM(cad.weighted_score), 0)
  INTO v_sum_scores
  FROM public.customer_capital_allocations_dynamic cad
  WHERE cad.salesperson_id = v_responsible
    AND cad.capital_setting_id = v_capital_setting_id;

  SELECT COALESCE(cad.weighted_score, 0)
  INTO v_self_snapshot
  FROM public.customer_capital_allocations_dynamic cad
  WHERE cad.salesperson_id = v_responsible
    AND cad.capital_setting_id = v_capital_setting_id
    AND cad.customer_id = p_customer_id
  LIMIT 1;

  v_sum_scores := GREATEST(0, v_sum_scores - v_self_snapshot) + v_weighted;

  IF v_sum_scores > 0 AND v_weighted > 0 THEN
    v_share_ratio := v_weighted / v_sum_scores;
    v_raw_allocation := ROUND(v_allocated_capital * v_share_ratio);
  ELSE
    v_share_ratio := 0;
    v_raw_allocation := 0;
  END IF;

  IF v_credit_limit > 0 AND v_credit_limit <= v_raw_allocation THEN
    v_final_limit := v_credit_limit;
    v_binding := 'credit_limit';
  ELSE
    v_final_limit := v_raw_allocation;
    v_binding := 'formula';
  END IF;

  RETURN jsonb_build_object(
    'weighted_score', v_weighted,
    'params_evaluated', v_params_evaluated,
    'params_active', v_params_active,
    'final_limit', v_final_limit,
    'raw_allocation', v_raw_allocation,
    'credit_limit', v_credit_limit,
    'binding_constraint', v_binding,
    'capital_date_used', v_capital_date,
    'is_capital_stale', v_is_stale,
    'salesperson_allocated_capital', v_allocated_capital,
    'share_ratio', v_share_ratio,
    'breakdown', v_breakdown
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. The quote-path RPC. `create_sales_quote_with_items` already gates on the
--    `has_overdue` / `overdue_since` this returns, so wiring this one function is
--    what makes the quote guard fire. Nothing in the quote RPC changes.
--    `outstanding_balance`, `total_purchases` and `settlement_score` keep reading
--    `customer_credit_profile` by `customer_person_id`, untouched.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_dynamic_credit(p_customer_id uuid)
 RETURNS TABLE(available_credit numeric, held_credit numeric, total_purchases numeric, outstanding_balance numeric, settlement_score integer, has_overdue boolean, overdue_since date, final_limit numeric, capital_date date, binding_constraint text, has_allocation boolean, is_today boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_final_limit numeric := 0;
  v_capital_date date;
  v_binding text;
  v_has_alloc boolean := false;
  v_is_today boolean := false;
  v_held numeric := 0;
  v_outstanding numeric := 0;
  v_total_purchases numeric := 0;
  v_settlement_score integer := 0;
  v_has_overdue boolean := false;
  v_overdue_since date;
  _person_id uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT person_id INTO _person_id FROM public.customers WHERE id = p_customer_id;
  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا به شخصی متصل نیست.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  -- Latest dynamic allocation (any date, newest first)
  SELECT a.final_limit, s.capital_date, a.binding_constraint
    INTO v_final_limit, v_capital_date, v_binding
  FROM public.customer_capital_allocations_dynamic a
  JOIN public.daily_capital_settings s ON s.id = a.capital_setting_id
  WHERE a.customer_person_id = _person_id
  ORDER BY s.capital_date DESC, a.created_at DESC
  LIMIT 1;

  IF v_final_limit IS NOT NULL THEN
    v_has_alloc := true;
    v_is_today := (v_capital_date = CURRENT_DATE);
  ELSE
    v_final_limit := 0;
  END IF;

  SELECT COALESCE(b.held_credit, 0) INTO v_held
  FROM public.customer_credit_balance b
  WHERE b.customer_person_id = _person_id;

  -- 454: `p.has_overdue` and `p.overdue_since` were read from this same row and were
  -- always false/NULL (0 rows). The three financial columns below are unchanged.
  SELECT
    COALESCE(p.outstanding_balance, 0),
    COALESCE(p.total_purchases, 0),
    COALESCE(p.settlement_score, 0)
  INTO v_outstanding, v_total_purchases, v_settlement_score
  FROM public.customer_credit_profile p
  WHERE p.customer_person_id = _person_id;

  -- 454: overdue now comes from live receivables, below the role check above.
  SELECT NOT ci.can_issue, ci.oldest_due_date
  INTO v_has_overdue, v_overdue_since
  FROM public.can_issue_customer_invoice(p_customer_id) ci;

  RETURN QUERY SELECT
    GREATEST(v_final_limit - COALESCE(v_outstanding, 0) - COALESCE(v_held, 0), 0)::numeric AS available_credit,
    COALESCE(v_held, 0)::numeric AS held_credit,
    COALESCE(v_total_purchases, 0)::numeric AS total_purchases,
    COALESCE(v_outstanding, 0)::numeric AS outstanding_balance,
    COALESCE(v_settlement_score, 0)::integer AS settlement_score,
    COALESCE(v_has_overdue, false)::boolean AS has_overdue,
    v_overdue_since AS overdue_since,
    COALESCE(v_final_limit, 0)::numeric AS final_limit,
    v_capital_date AS capital_date,
    COALESCE(v_binding, '')::text AS binding_constraint,
    v_has_alloc AS has_allocation,
    v_is_today AS is_today;
END;
$function$;
