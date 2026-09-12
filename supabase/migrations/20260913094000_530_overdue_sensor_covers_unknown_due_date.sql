SET client_encoding='UTF8';

-- 530 — the overdue credit gate now catches a debt with no settlement term.
--
-- WHAT WAS WRONG. `can_issue_customer_invoice` reads `vw_customer_receivables` and
-- filtered on `r.is_overdue = true`. The view defines:
--
--   is_overdue := due_date IS NOT NULL AND due_date < tehran_today() AND outstanding_amount > 0
--
-- A row with NO settlement term (`due_date IS NULL`) can never satisfy
-- `due_date IS NOT NULL`, so it can never be `is_overdue`, no matter how large the
-- outstanding balance or how long it has sat unpaid. The view already computes this
-- case separately as `due_date_unknown` (`due_date IS NULL`), and already exposes it
-- to `get_receivables_summary`/`get_receivables_list` as a distinct metric
-- (`due_date_unknown_outstanding`, `count_due_date_unknown`) — but `can_issue_customer_invoice`
-- never read that column, so a debt with no due date silently passed the credit gate.
--
-- LATENT, NOT LIVE. Measured on the restored production snapshot (prod_rehearsal_e2,
-- ledger 681 / 20260912150000): zero `vw_customer_receivables` rows currently have
-- `due_date_unknown = true` AND `outstanding_amount > 0`. The three sensors this
-- migration touches therefore already agree today; this closes the gap before the
-- first such row exists, not because a customer is exploiting it now.
--
-- ONE FUNCTION IS THE SINGLE POINT OF REPAIR. `get_customer_dynamic_credit` and
-- `calculate_customer_realtime_credit` both call `can_issue_customer_invoice`, and
-- `create_sales_quote_with_items` calls `get_customer_dynamic_credit`. Rewriting
-- `can_issue_customer_invoice` alone converges the sensor, the credit RPCs and the
-- quote path. Neither caller changes in this migration.
--
-- WHAT CHANGES. The predicate widens from `r.is_overdue = true` to
-- `(r.is_overdue = true OR r.due_date_unknown = true)`, both still gated on
-- `outstanding_amount > 0`. The Persian workbench text is unchanged — a debt with an
-- unknown due date is still real money the customer owes, and this function has never
-- had a second message for it, so it is folded into the same "has an overdue balance"
-- reason rather than inventing new UI copy.
--
-- WHAT DOES NOT CHANGE. Role gate (42501 for anyone outside
-- admin/manager/accountant/sales), SECURITY DEFINER, the REVOKE/GRANT posture from
-- 454, and the Persian reason string — all carried forward byte-identical.

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

  -- 530: a debt with no settlement term (due_date_unknown) is now counted alongside a
  -- debt past its due date (is_overdue). Both still require a genuine open balance.
  SELECT COALESCE(SUM(r.outstanding_amount),0)::numeric,
         COUNT(*)::int,
         MIN(r.due_date)
    INTO v_amount, v_count, v_oldest
  FROM public.vw_customer_receivables r
  WHERE r.customer_id = p_customer_id
    AND (r.is_overdue = true OR r.due_date_unknown = true)
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

-- Same posture as 454. CREATE OR REPLACE preserves existing grants, so the REVOKEs are
-- what actually keep the anonymous path closed; they are not implied by the replace.
REVOKE EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.can_issue_customer_invoice(uuid) TO service_role;
