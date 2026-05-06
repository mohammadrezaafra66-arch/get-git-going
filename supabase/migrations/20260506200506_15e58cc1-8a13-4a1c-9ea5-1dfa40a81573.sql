
-- Phase 18.1C — List/detail RPCs for accounting commitments
-- Read-only, role-guarded (admin|manager|accountant). Direct view access stays revoked.

-- ===== Receivables list =====
CREATE OR REPLACE FUNCTION public.get_receivables_list(
  p_from_date    date  DEFAULT NULL,
  p_to_date      date  DEFAULT NULL,
  p_customer_id  uuid  DEFAULT NULL,
  p_due_filter   text  DEFAULT 'all',
  p_search       text  DEFAULT NULL,
  p_limit        int   DEFAULT 50,
  p_offset       int   DEFAULT 0
)
RETURNS TABLE (
  customer_id            uuid,
  customer_name          text,
  invoice_id             uuid,
  invoice_number         text,
  invoice_type           text,
  invoice_status         text,
  due_date               date,
  total_amount           numeric,
  deposit_amount         numeric,
  confirmed_paid_amount  numeric,
  outstanding_amount     numeric,
  days_until_due         int,
  is_overdue             boolean,
  created_at             timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v.customer_id, v.customer_name, v.invoice_id, v.invoice_number,
    v.invoice_type, v.invoice_status, v.due_date, v.total_amount,
    v.deposit_amount, v.confirmed_paid_amount, v.outstanding_amount,
    v.days_until_due, v.is_overdue, v.created_at
  FROM public.vw_customer_receivables v
  WHERE (p_customer_id IS NULL OR v.customer_id = p_customer_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date)
    AND (
      p_due_filter = 'all'
      OR (p_due_filter = 'overdue'  AND v.is_overdue)
      OR (p_due_filter = 'today'    AND v.due_date = CURRENT_DATE)
      OR (p_due_filter = 'tomorrow' AND v.due_date = CURRENT_DATE + 1)
      OR (p_due_filter = 'future'   AND v.due_date > CURRENT_DATE + 1)
    )
    AND (
      v_search IS NULL
      OR v.customer_name ILIKE '%'||v_search||'%'
      OR v.invoice_number ILIKE '%'||v_search||'%'
    )
  ORDER BY
    v.is_overdue DESC,
    v.due_date NULLS LAST,
    v.outstanding_amount DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_receivables_list(date,date,uuid,text,text,int,int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_receivables_list(date,date,uuid,text,text,int,int) TO authenticated;
COMMENT ON FUNCTION public.get_receivables_list(date,date,uuid,text,text,int,int) IS
  'Phase 18.1C — read-only, role-guarded (admin|manager|accountant). For accounting reports. Direct view access remains restricted.';


-- ===== Receivable detail =====
CREATE OR REPLACE FUNCTION public.get_receivable_detail(
  p_customer_id  uuid DEFAULT NULL,
  p_invoice_id   uuid DEFAULT NULL
)
RETURNS TABLE (
  customer_id            uuid,
  customer_name          text,
  customer_phone         text,
  invoice_id             uuid,
  invoice_number         text,
  invoice_type           text,
  invoice_status         text,
  issue_date             date,
  due_date               date,
  total_amount           numeric,
  deposit_amount         numeric,
  confirmed_paid_amount  numeric,
  outstanding_amount     numeric,
  is_overdue             boolean,
  receipt_id             uuid,
  receipt_amount         numeric,
  receipt_status         text,
  receipt_payment_date   date,
  receipt_tracking_number text,
  receipt_bank_name      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NULL AND p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id or p_invoice_id required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.customer_id, v.customer_name, c.phone AS customer_phone,
    v.invoice_id, v.invoice_number, v.invoice_type, v.invoice_status,
    i.issue_date, v.due_date,
    v.total_amount, v.deposit_amount, v.confirmed_paid_amount,
    v.outstanding_amount, v.is_overdue,
    pr.id AS receipt_id, prl.amount AS receipt_amount, pr.status AS receipt_status,
    pr.payment_date AS receipt_payment_date,
    pr.tracking_number AS receipt_tracking_number,
    pr.bank_name AS receipt_bank_name
  FROM public.vw_customer_receivables v
  JOIN public.invoices i               ON i.id = v.invoice_id
  LEFT JOIN public.customers c         ON c.id = v.customer_id
  LEFT JOIN public.payment_receipt_links prl ON prl.invoice_id = v.invoice_id
  LEFT JOIN public.payment_receipts    pr   ON pr.id = prl.receipt_id
  WHERE (p_invoice_id  IS NULL OR v.invoice_id  = p_invoice_id)
    AND (p_customer_id IS NULL OR v.customer_id = p_customer_id)
  ORDER BY v.due_date NULLS LAST, pr.payment_date NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_receivable_detail(uuid,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_receivable_detail(uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.get_receivable_detail(uuid,uuid) IS
  'Phase 18.1C — read-only, role-guarded. Returns one row per linked payment per outstanding invoice; UI groups by invoice.';


-- ===== Payables list =====
CREATE OR REPLACE FUNCTION public.get_payables_list(
  p_from_date    date  DEFAULT NULL,
  p_to_date      date  DEFAULT NULL,
  p_supplier_id  uuid  DEFAULT NULL,
  p_due_filter   text  DEFAULT 'all',
  p_search       text  DEFAULT NULL,
  p_limit        int   DEFAULT 50,
  p_offset       int   DEFAULT 0,
  p_include_paid boolean DEFAULT false
)
RETURNS TABLE (
  supplier_id            uuid,
  supplier_name          text,
  purchase_id            uuid,
  purchase_date          date,
  due_date               date,
  payment_term_days      int,
  purchase_total_amount  numeric,
  cash_price             numeric,
  currency               text,
  paid_at                timestamptz,
  outstanding_amount     numeric,
  is_paid                boolean,
  days_until_due         int,
  is_overdue             boolean,
  product_summary        text,
  created_at             timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit  int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    v.supplier_id, v.supplier_name, v.purchase_id, v.purchase_date, v.due_date,
    v.payment_term_days, v.purchase_total_amount, v.cash_price, v.currency,
    v.paid_at, v.outstanding_amount, v.is_paid, v.days_until_due, v.is_overdue,
    v.product_summary, v.created_at
  FROM public.vw_supplier_payables v
  WHERE (p_include_paid OR v.is_paid = false)
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date)
    AND (
      p_due_filter = 'all'
      OR (p_due_filter = 'overdue'  AND v.is_overdue)
      OR (p_due_filter = 'today'    AND v.due_date = CURRENT_DATE)
      OR (p_due_filter = 'tomorrow' AND v.due_date = CURRENT_DATE + 1)
      OR (p_due_filter = 'future'   AND v.due_date > CURRENT_DATE + 1)
    )
    AND (
      v_search IS NULL
      OR v.supplier_name ILIKE '%'||v_search||'%'
      OR v.purchase_id::text ILIKE '%'||v_search||'%'
    )
  ORDER BY
    v.is_overdue DESC,
    v.due_date NULLS LAST,
    v.outstanding_amount DESC
  LIMIT v_limit OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payables_list(date,date,uuid,text,text,int,int,boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_payables_list(date,date,uuid,text,text,int,int,boolean) TO authenticated;
COMMENT ON FUNCTION public.get_payables_list(date,date,uuid,text,text,int,int,boolean) IS
  'Phase 18.1C — read-only, role-guarded. Defaults to unpaid purchases; pass p_include_paid=true to include paid ones.';


-- ===== Payable detail =====
CREATE OR REPLACE FUNCTION public.get_payable_detail(
  p_supplier_id  uuid DEFAULT NULL,
  p_purchase_id  uuid DEFAULT NULL
)
RETURNS TABLE (
  supplier_id            uuid,
  supplier_name          text,
  purchase_id            uuid,
  purchase_date          date,
  due_date               date,
  payment_term_days      int,
  purchase_total_amount  numeric,
  cash_price             numeric,
  currency               text,
  paid_at                timestamptz,
  outstanding_amount     numeric,
  is_paid                boolean,
  is_overdue             boolean,
  item_id                uuid,
  product_id             uuid,
  product_name           text,
  item_quantity          numeric,
  item_unit_price        numeric,
  item_line_total        numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_supplier_id IS NULL AND p_purchase_id IS NULL THEN
    RAISE EXCEPTION 'p_supplier_id or p_purchase_id required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.supplier_id, v.supplier_name, v.purchase_id, v.purchase_date, v.due_date,
    v.payment_term_days, v.purchase_total_amount, v.cash_price, v.currency,
    v.paid_at, v.outstanding_amount, v.is_paid, v.is_overdue,
    pi.id AS item_id,
    COALESCE(pi.product_id, pu.product_id) AS product_id,
    pr.name AS product_name,
    COALESCE(pi.quantity, pu.quantity) AS item_quantity,
    COALESCE(pi.unit_price, pu.purchase_price) AS item_unit_price,
    COALESCE(pi.line_total, pu.purchase_price * pu.quantity) AS item_line_total
  FROM public.vw_supplier_payables v
  JOIN public.purchases pu              ON pu.id = v.purchase_id
  LEFT JOIN public.purchase_items pi    ON pi.purchase_id = v.purchase_id
  LEFT JOIN public.products pr          ON pr.id = COALESCE(pi.product_id, pu.product_id)
  WHERE (p_purchase_id IS NULL OR v.purchase_id = p_purchase_id)
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
  ORDER BY v.purchase_date DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payable_detail(uuid,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_payable_detail(uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.get_payable_detail(uuid,uuid) IS
  'Phase 18.1C — read-only, role-guarded. Returns purchase + items rows; partial purchase payments not modeled yet.';
