-- AFK-G3-012: fix ambiguous customer_id reference in overdue invoice blocker RPC.
--
-- Problem found during isolated AFK-G3-013 DB scenario testing:
-- public.can_issue_customer_invoice(uuid) returned a column named customer_id and
-- also queried public.vw_customer_receivables.customer_id without a table alias.
-- PostgreSQL can treat that as ambiguous inside PL/pgSQL.
--
-- This migration is intentionally narrow and non-destructive:
-- - no table changes
-- - no data changes
-- - rewrites only the RPC body with an explicit view alias
-- - keeps the existing trigger/API contract unchanged

CREATE OR REPLACE FUNCTION public.can_issue_customer_invoice(p_customer_id uuid)
RETURNS TABLE(
  can_issue boolean,
  customer_id uuid,
  overdue_amount numeric,
  overdue_count integer,
  oldest_due_date date,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_amount numeric := 0;
  v_count integer := 0;
  v_oldest date;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id الزامی است' USING ERRCODE = '22023';
  END IF;

  SELECT
    COALESCE(SUM(r.outstanding_amount), 0)::numeric,
    COUNT(*)::int,
    MIN(r.due_date)
  INTO v_amount, v_count, v_oldest
  FROM public.vw_customer_receivables AS r
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

REVOKE EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) TO authenticated;

COMMENT ON FUNCTION public.can_issue_customer_invoice(uuid) IS
'AFK-G3-012 fix: بررسی مجاز بودن صدور فاکتور/پیش‌فاکتور برای مشتری؛ uses explicit alias on vw_customer_receivables to avoid PL/pgSQL customer_id ambiguity.';
