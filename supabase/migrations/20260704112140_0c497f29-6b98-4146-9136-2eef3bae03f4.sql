
CREATE OR REPLACE FUNCTION public.calculate_customer_realtime_credit(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT c.responsible_id,
         COALESCE(cp.credit_limit, 0),
         COALESCE(cp.has_overdue, false)
  INTO v_responsible, v_credit_limit, v_has_overdue
  FROM public.customers c
  LEFT JOIN public.customer_credit_profile cp ON cp.customer_id = c.id
  WHERE c.id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found: %', p_customer_id;
  END IF;

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
$$;

REVOKE ALL ON FUNCTION public.calculate_customer_realtime_credit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_customer_realtime_credit(uuid) TO authenticated;
