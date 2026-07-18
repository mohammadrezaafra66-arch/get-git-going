CREATE OR REPLACE FUNCTION public.can_issue_customer_invoice(p_customer_id uuid)
 RETURNS TABLE(can_issue boolean, customer_id uuid, overdue_amount numeric, overdue_count integer, oldest_due_date date, reason text)
 LANGUAGE plpgsql
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