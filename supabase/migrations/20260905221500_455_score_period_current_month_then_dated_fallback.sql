SET client_encoding='UTF8';

-- 455 — D-9: the score reader takes the current month first, and falls back to the most
-- recent month that actually has data, dated.
--
-- THE MISMATCH, MEASURED 2026-09-05. One page — /sales/customers/<id>/credit — asked the
-- same question three different ways:
--
--   * the score-entry section wrote and read `currentPeriodMonth()`      -> 2026-09-01
--   * the realtime credit card read the capital snapshot's month         -> 2026-08-01
--   * the newest scores that exist for six of the eleven scored customers-> 2026-07-01
--
--   dynamic_entity_scores, by period:  customer 2026-08-01: 53 rows / 6 entities
--                                      customer 2026-07-01: 38 rows / 5 entities
--                                      customer 2026-09-01:  0 rows
--
-- So the entry screen showed an empty September, the card showed an August score of
-- 0.000000 for anyone last scored in July, and the real number was sitting one month
-- further back. Nothing was broken in the arithmetic; the two halves of one page were
-- simply asking about different months.
--
-- THE OWNER'S DECISION (D-9), carried here as given: read the current month first; if it is
-- empty fall back to the most recent month that has data; and show that month's date in the
-- UI. Current-month-first makes writer and reader agree, so the mismatch becomes impossible.
-- The dated fallback means the page is never blank while the user can still see how stale the
-- number is.
--
-- ONE DEFINITION. `resolve_score_period` below is that definition and it is the only one.
-- Everything that needs "which month should I read for this entity" calls it, directly or by
-- passing NULL to `calculate_dynamic_score`. It is deliberately **per entity**: the fallback
-- has to be the newest month *this* customer was scored in, because the six customers above
-- are exactly the ones a global "newest month overall" would still show as 0.000000.
--
-- WHAT THIS DOES NOT TOUCH — READ BEFORE EXTENDING IT. `run_daily_capital_allocation` and
-- `recompute_dynamic_capital_setting` both pass an **explicit** period
-- (`p_capital_date` / `v_setting.capital_date`) into `calculate_dynamic_score`. They are
-- therefore untouched by this migration, and **no stored credit ceiling in
-- `customer_capital_allocations_dynamic` moves**. That was checked before writing this, for
-- the reason CLAUDE.md rule 10 exists: a scoring change that quietly rewrites real ceilings is
-- how migration 411 moved nine customers' credit without anyone asking for it. The explicit
-- period parameter keeps working exactly as before and is still the right thing for any
-- point-in-time question.
--
-- WHAT DOES MOVE, and it is a preview only. `calculate_customer_realtime_credit` is STABLE
-- and writes nothing; it answers "what would this customer get right now". Switching its
-- score period from the capital month to the resolved month changes that preview for the six
-- July-only customers, whose displayed score goes from 0.000000 to their real July figure
-- (measured: مشتری آزمایشی 11 0.000000 -> 1.000000, مشتری آزمایشی 18 -> 0.281050,
-- مشتری آزمایشی 17 -> 0.245900, مشتری آزمایشی 16 -> 0.219667, مشتری آزمایشی 20 -> 0.188950,
-- شخص آزمایشی 1 -> 0.042250). Two of those six are the customers migration 454 now refuses
-- for overdue, and that refusal is evaluated *before* the score, so it still stands.

-- ---------------------------------------------------------------------------
-- 1. The definition.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_score_period(p_entity_type text, p_entity_id uuid)
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    -- 1. the current month, but only if this entity actually has a score in it
    (SELECT date_trunc('month', current_date)::date
      WHERE EXISTS (
        SELECT 1 FROM public.dynamic_entity_scores s
         WHERE s.entity_type  = p_entity_type
           AND s.entity_id    = p_entity_id
           AND s.period_month = date_trunc('month', current_date)::date
           AND s.raw_score IS NOT NULL)),
    -- 2. otherwise the most recent month this entity was scored in
    (SELECT MAX(s.period_month) FROM public.dynamic_entity_scores s
      WHERE s.entity_type = p_entity_type
        AND s.entity_id   = p_entity_id
        AND s.raw_score IS NOT NULL),
    -- 3. never scored at all: the current month, which reads as empty rather than as an error
    date_trunc('month', current_date)::date
  );
$function$;

COMMENT ON FUNCTION public.resolve_score_period(text, uuid) IS
  'D-9: which month to read a dynamic score for. Current month when this entity has one, else the most recent month it does, else the current month. The single definition -- do not inline a copy.';

-- SECURITY INVOKER on purpose: `dynamic_entity_scores` carries its own RLS (read for
-- authenticated, restrictive deny for viewer-only), so the caller's own grants decide what
-- this can see. Closed to anon for the same reason as 454 -- a new function is born with a
-- PUBLIC grant from acldefault(), and revoking `anon` alone would leave it.
REVOKE EXECUTE ON FUNCTION public.resolve_score_period(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_score_period(text, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.resolve_score_period(text, uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.resolve_score_period(text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. `calculate_dynamic_score` uses it when no period is named.
--    An explicit p_period_month still wins, unchanged, so every point-in-time caller
--    (both capital-allocation writers included) behaves exactly as before.
--    Only the period resolution and two new reported keys change; the arithmetic below
--    is the live definition verbatim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_dynamic_score(p_entity_type text, p_entity_id uuid, p_period_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period date;
  v_current_month date := date_trunc('month', current_date)::date;
  v_total_active_weight numeric := 0;
  v_weighted_score numeric := 0;
  v_params_active int := 0;
  v_params_evaluated int := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF p_entity_type NOT IN ('customer','salesperson') THEN
    RAISE EXCEPTION 'entity_type نامعتبر: %', p_entity_type;
  END IF;

  -- 455 (D-9): was `date_trunc('month', COALESCE(p_period_month, current_date))`, i.e. the
  -- current month with no fallback, which is why a customer last scored in July read as 0.
  v_period := CASE
                WHEN p_period_month IS NOT NULL
                  THEN date_trunc('month', p_period_month)::date
                ELSE public.resolve_score_period(p_entity_type, p_entity_id)
              END;

  SELECT COALESCE(SUM(w.weight), 0)
  INTO v_total_active_weight
  FROM dynamic_scoring_parameters p
  JOIN dynamic_parameter_weights w
    ON w.parameter_id = p.id
    AND w.valid_from <= v_period
    AND (w.valid_to IS NULL OR w.valid_to >= v_period)
  JOIN dynamic_entity_scores s
    ON s.parameter_id = p.id
    AND s.entity_type = p_entity_type
    AND s.entity_id = p_entity_id
    AND s.period_month = v_period
  WHERE p.entity_type = p_entity_type
    AND p.is_active = true;

  SELECT COUNT(*)
  INTO v_params_active
  FROM dynamic_scoring_parameters
  WHERE entity_type = p_entity_type AND is_active = true;

  SELECT
    COUNT(*) FILTER (WHERE s.raw_score IS NOT NULL),
    jsonb_agg(
      jsonb_build_object(
        'parameter_code',    p.code,
        'parameter_name',    p.label_fa,
        'input_type',        p.input_type,
        'unit_label',        p.unit_label,
        'min_value',         p.min_value,
        'max_value',         p.max_value,
        'actual_value',      s.actual_value,
        'is_clipped',        COALESCE(s.is_clipped, false),
        'raw_score',         s.raw_score,
        'raw_weight',        w.weight,
        'normalized_weight', CASE
                                WHEN s.raw_score IS NOT NULL AND v_total_active_weight > 0
                                THEN ROUND((w.weight / v_total_active_weight)::numeric, 6)
                                ELSE 0
                              END,
        'contribution',      CASE
                                WHEN s.raw_score IS NOT NULL AND v_total_active_weight > 0
                                THEN ROUND((s.raw_score * w.weight / v_total_active_weight)::numeric, 6)
                                ELSE 0
                              END,
        'has_score',         s.raw_score IS NOT NULL
      ) ORDER BY p.display_order
    )
  INTO v_params_evaluated, v_breakdown
  FROM dynamic_scoring_parameters p
  LEFT JOIN dynamic_parameter_weights w
    ON w.parameter_id = p.id
    AND w.valid_from <= v_period
    AND (w.valid_to IS NULL OR w.valid_to >= v_period)
  LEFT JOIN dynamic_entity_scores s
    ON s.parameter_id = p.id
    AND s.entity_type = p_entity_type
    AND s.entity_id = p_entity_id
    AND s.period_month = v_period
  WHERE p.entity_type = p_entity_type
    AND p.is_active = true;

  IF v_total_active_weight > 0 THEN
    SELECT COALESCE(SUM(s.raw_score * w.weight / v_total_active_weight), 0)
    INTO v_weighted_score
    FROM dynamic_scoring_parameters p
    JOIN dynamic_parameter_weights w
      ON w.parameter_id = p.id
      AND w.valid_from <= v_period
      AND (w.valid_to IS NULL OR w.valid_to >= v_period)
    JOIN dynamic_entity_scores s
      ON s.parameter_id = p.id
      AND s.entity_type = p_entity_type
      AND s.entity_id = p_entity_id
      AND s.period_month = v_period
    WHERE p.entity_type = p_entity_type
      AND p.is_active = true;
  END IF;

  v_result := jsonb_build_object(
    'entity_type', p_entity_type,
    'entity_id', p_entity_id,
    'period_month', v_period,
    -- 455: the UI must be able to say "this number is from an older month" without
    -- recomputing the rule for itself.
    'period_is_current', (v_period = v_current_month),
    'period_is_fallback', (p_period_month IS NULL AND v_period <> v_current_month),
    'weighted_score', ROUND(v_weighted_score::numeric, 6),
    'total_active_weight', v_total_active_weight,
    'params_active', v_params_active,
    'params_evaluated', COALESCE(v_params_evaluated, 0),
    'breakdown', COALESCE(v_breakdown, '[]'::jsonb)
  );

  -- D8-4 (migration 272): attach the band. This MERGES extra keys onto the
  -- result and touches none of the arithmetic above -- weighted_score and every
  -- other field are produced by exactly the same code as before. The band is
  -- resolved against v_period, so a score from three months ago shows the label
  -- it had then, not today's.
  v_result := v_result || public.score_level_at(ROUND(v_weighted_score::numeric, 6), v_period);

  RETURN v_result;
END $function$;

-- ---------------------------------------------------------------------------
-- 3. The realtime credit card asks the same question the entry screen does.
--    It passed the capital snapshot's month, which is what made one page show two
--    different scores for one customer. It now passes NULL -- i.e. it uses the one
--    definition -- and reports which month it landed on so the card can label it.
--    Everything else, including the whole allocation arithmetic and the 454 overdue
--    gate above it, is the live definition verbatim.
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
  v_score_period date;
  v_score_period_is_fallback boolean := false;
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
  -- on purpose — see migration 454's note on the view's fail-open guard.
  SELECT NOT ci.can_issue
  INTO v_has_overdue
  FROM public.can_issue_customer_invoice(p_customer_id) ci;

  -- 455 (D-9): resolve the score period once, up front, so that every exit below reports
  -- the same month the score was actually read from.
  v_score_period := public.resolve_score_period('customer', p_customer_id);
  v_score_period_is_fallback := (v_score_period <> date_trunc('month', current_date)::date);

  IF v_has_overdue THEN
    RETURN jsonb_build_object(
      'weighted_score', 0, 'params_evaluated', 0, 'params_active', 0,
      'final_limit', 0, 'raw_allocation', 0, 'credit_limit', v_credit_limit,
      'binding_constraint', 'overdue', 'capital_date_used', NULL,
      'is_capital_stale', false, 'salesperson_allocated_capital', 0,
      'share_ratio', 0, 'breakdown', '[]'::jsonb,
      'score_period_month', v_score_period,
      'score_period_is_fallback', v_score_period_is_fallback
    );
  END IF;

  IF v_responsible IS NULL THEN
    RETURN jsonb_build_object(
      'weighted_score', 0, 'params_evaluated', 0, 'params_active', 0,
      'final_limit', 0, 'raw_allocation', 0, 'credit_limit', v_credit_limit,
      'binding_constraint', 'no_salesperson', 'capital_date_used', NULL,
      'is_capital_stale', false, 'salesperson_allocated_capital', 0,
      'share_ratio', 0, 'breakdown', '[]'::jsonb,
      'score_period_month', v_score_period,
      'score_period_is_fallback', v_score_period_is_fallback
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
    -- 455: was CURRENT_DATE, which pinned this to the current month with no fallback.
    v_score := public.calculate_dynamic_score('customer', p_customer_id, NULL);
    RETURN jsonb_build_object(
      'weighted_score', COALESCE((v_score->>'weighted_score')::numeric, 0),
      'params_evaluated', COALESCE((v_score->>'params_evaluated')::int, 0),
      'params_active', COALESCE((v_score->>'params_active')::int, 0),
      'final_limit', 0, 'raw_allocation', 0, 'credit_limit', v_credit_limit,
      'binding_constraint', 'no_capital', 'capital_date_used', NULL,
      'is_capital_stale', false, 'salesperson_allocated_capital', 0,
      'share_ratio', 0, 'breakdown', COALESCE(v_score->'breakdown', '[]'::jsonb),
      'score_period_month', COALESCE((v_score->>'period_month')::date, v_score_period),
      'score_period_is_fallback', COALESCE((v_score->>'period_is_fallback')::boolean, v_score_period_is_fallback)
    );
  END IF;

  v_is_stale := v_capital_date < CURRENT_DATE;

  -- 455: was `v_capital_date`. That is what made this card read August for a customer whose
  -- newest scores are in July, and show 0.000000. The capital date still drives the capital
  -- snapshot and the peer set below; only the *score period* moved to the one definition.
  v_score := public.calculate_dynamic_score('customer', p_customer_id, NULL);
  v_weighted         := COALESCE((v_score->>'weighted_score')::numeric, 0);
  v_params_evaluated := COALESCE((v_score->>'params_evaluated')::int, 0);
  v_params_active    := COALESCE((v_score->>'params_active')::int, 0);
  v_breakdown        := COALESCE(v_score->'breakdown', '[]'::jsonb);
  v_score_period     := COALESCE((v_score->>'period_month')::date, v_score_period);
  v_score_period_is_fallback := COALESCE((v_score->>'period_is_fallback')::boolean, v_score_period_is_fallback);

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
    'breakdown', v_breakdown,
    'score_period_month', v_score_period,
    'score_period_is_fallback', v_score_period_is_fallback
  );
END;
$function$;
