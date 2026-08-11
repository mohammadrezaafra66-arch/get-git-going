DROP FUNCTION IF EXISTS public.get_customer_credit(uuid);

CREATE FUNCTION public.get_customer_credit(p_customer_id uuid)
RETURNS TABLE(
  available_credit numeric,
  held_credit numeric,
  total_purchases numeric,
  outstanding_balance numeric,
  settlement_score integer,
  has_overdue boolean,
  overdue_since date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  RETURN QUERY
  SELECT
    b.available_credit,
    b.held_credit,
    COALESCE(p.total_purchases, 0)::numeric,
    COALESCE(p.outstanding_balance, 0)::numeric,
    COALESCE(p.settlement_score, 0)::integer,
    COALESCE(p.has_overdue, false)::boolean,
    p.overdue_since
  FROM public.customer_credit_balance b
  LEFT JOIN public.customer_credit_profile p ON p.customer_id = b.customer_id
  WHERE b.customer_id = p_customer_id;
END;
$function$;