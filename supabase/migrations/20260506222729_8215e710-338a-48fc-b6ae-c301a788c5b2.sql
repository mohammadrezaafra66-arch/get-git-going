-- Phase 21.6B: read-only RPC for salesperson collected sales
CREATE OR REPLACE FUNCTION public.calculate_salesperson_collected_sales(
  p_employee_id uuid,
  p_window_months integer DEFAULT 6
)
RETURNS TABLE (
  employee_id uuid,
  window_months integer,
  window_start date,
  collected_amount numeric,
  linked_invoice_count integer,
  qualifying_receipt_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_window int;
  v_start date;
  v_is_priv boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_employee_id IS NULL THEN
    RAISE EXCEPTION 'p_employee_id is required' USING ERRCODE = '22023';
  END IF;

  v_is_priv := public.has_any_role(v_uid, ARRAY['admin','manager','accountant']::public.app_role[]);

  -- sales role: only own data; viewer or others: forbidden
  IF NOT v_is_priv THEN
    IF public.has_role(v_uid, 'sales'::public.app_role) THEN
      IF p_employee_id <> v_uid THEN
        RAISE EXCEPTION 'forbidden: sales may only query own collected sales' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_window := GREATEST(1, LEAST(COALESCE(p_window_months, 6), 60));
  v_start := (now() - (v_window || ' months')::interval)::date;

  RETURN QUERY
  WITH eligible AS (
    SELECT
      i.id              AS invoice_id,
      i.total_amount    AS invoice_total,
      prl.id            AS link_id,
      prl.amount        AS link_amount,
      pr.id             AS receipt_id
    FROM public.invoices i
    JOIN public.payment_receipt_links prl ON prl.invoice_id = i.id
    JOIN public.payment_receipts pr       ON pr.id = prl.receipt_id
    WHERE i.created_by = p_employee_id
      AND COALESCE(i.status, '') NOT IN ('draft','cancelled')
      AND pr.status IN ('approved','verified','confirmed','posted')
      AND pr.payment_date >= v_start
  ),
  per_invoice AS (
    SELECT
      invoice_id,
      LEAST(COALESCE(invoice_total, 0), COALESCE(SUM(link_amount), 0)) AS capped_amount,
      COUNT(DISTINCT receipt_id) AS receipt_cnt
    FROM eligible
    GROUP BY invoice_id, invoice_total
  )
  SELECT
    p_employee_id,
    v_window,
    v_start,
    COALESCE(SUM(capped_amount), 0)::numeric        AS collected_amount,
    COALESCE(COUNT(*), 0)::int                      AS linked_invoice_count,
    COALESCE(SUM(receipt_cnt), 0)::int              AS qualifying_receipt_count
  FROM per_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_salesperson_collected_sales(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_salesperson_collected_sales(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.calculate_salesperson_collected_sales(uuid, integer) IS
'Phase 21.6B: read-only RPC. Returns collected (paid) sales for a salesperson within a window (1..60 months, default 6). Salesperson = invoices.created_by. Status whitelist: approved/verified/confirmed/posted. Per-invoice cap = invoice.total_amount. Role guard: admin/manager/accountant any; sales own only; viewer forbidden. No writes, no audit, no triggers, no parallel system. Indexes used (existing): invoices_created_by_idx, idx_payment_receipt_links_invoice_id, idx_prl_receipt_id, idx_payment_receipts_status_date.';