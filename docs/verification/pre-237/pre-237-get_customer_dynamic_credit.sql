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
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  -- Latest dynamic allocation (any date, newest first)
  SELECT a.final_limit, s.capital_date, a.binding_constraint
    INTO v_final_limit, v_capital_date, v_binding
  FROM public.customer_capital_allocations_dynamic a
  JOIN public.daily_capital_settings s ON s.id = a.capital_setting_id
  WHERE a.customer_id = p_customer_id
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
  WHERE b.customer_id = p_customer_id;

  SELECT
    COALESCE(p.outstanding_balance, 0),
    COALESCE(p.total_purchases, 0),
    COALESCE(p.settlement_score, 0),
    COALESCE(p.has_overdue, false),
    p.overdue_since
  INTO v_outstanding, v_total_purchases, v_settlement_score, v_has_overdue, v_overdue_since
  FROM public.customer_credit_profile p
  WHERE p.customer_id = p_customer_id;

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
$function$
