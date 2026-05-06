
-- Phase 18.1 — Commitments read-only data layer
-- Read-only views + summary RPCs for receivables (customers) and payables (suppliers).
-- NOTES:
--   * Views use security_invoker = true so RLS on base tables (invoices, purchases, etc.) is preserved.
--   * Confirmed payment statuses considered: 'approved','verified','confirmed','posted'.
--     Adjust here if posting policy is finalized in a later phase.
--   * Partial payment of purchases is NOT modeled in current schema; outstanding for an
--     unpaid purchase = coalesce(cash_price, total_amount). To be revisited when partial
--     purchase payments are introduced.
--   * Multi-currency: currency is preserved as-is; no FX conversion applied.
--   * Audit logging not required in this phase (read-only).

-- =========================
-- View: customer receivables
-- =========================
DROP VIEW IF EXISTS public.vw_customer_receivables;
CREATE VIEW public.vw_customer_receivables
WITH (security_invoker = true) AS
WITH paid AS (
  SELECT prl.invoice_id, COALESCE(SUM(prl.amount), 0)::numeric AS confirmed_paid_amount
  FROM public.payment_receipt_links prl
  JOIN public.payment_receipts pr ON pr.id = prl.receipt_id
  WHERE pr.status IN ('approved','verified','confirmed','posted')
  GROUP BY prl.invoice_id
)
SELECT
  i.customer_id,
  c.name                                            AS customer_name,
  i.id                                              AS invoice_id,
  i.number                                          AS invoice_number,
  i.invoice_type,
  i.status                                          AS invoice_status,
  i.due_date,
  i.total_amount,
  COALESCE(i.deposit_amount, 0)::numeric            AS deposit_amount,
  COALESCE(p.confirmed_paid_amount, 0)::numeric     AS confirmed_paid_amount,
  GREATEST(
    i.total_amount - COALESCE(i.deposit_amount,0) - COALESCE(p.confirmed_paid_amount,0),
    0
  )::numeric                                        AS outstanding_amount,
  i.commitment_confirmed,
  CASE WHEN i.due_date IS NOT NULL
       THEN (i.due_date - CURRENT_DATE)
       ELSE NULL END                                AS days_until_due,
  (i.due_date IS NOT NULL
   AND i.due_date < CURRENT_DATE
   AND (i.total_amount - COALESCE(i.deposit_amount,0) - COALESCE(p.confirmed_paid_amount,0)) > 0
  )                                                 AS is_overdue,
  i.created_at
FROM public.invoices i
LEFT JOIN public.customers c ON c.id = i.customer_id
LEFT JOIN paid p             ON p.invoice_id = i.id
WHERE i.commitment_confirmed = true
  AND COALESCE(i.status, '') <> 'cancelled'
  AND GREATEST(
        i.total_amount - COALESCE(i.deposit_amount,0) - COALESCE(p.confirmed_paid_amount,0),
        0
      ) > 0;

COMMENT ON VIEW public.vw_customer_receivables IS
  'Phase 18.1 — read-only receivables: outstanding per confirmed-commitment invoice.';

-- =========================
-- View: supplier payables
-- =========================
DROP VIEW IF EXISTS public.vw_supplier_payables;
CREATE VIEW public.vw_supplier_payables
WITH (security_invoker = true) AS
SELECT
  p.supplier_id,
  s.name                                                  AS supplier_name,
  p.id                                                    AS purchase_id,
  p.purchase_date,
  pt.days                                                 AS payment_term_days,
  CASE
    WHEN pt.days IS NOT NULL
      THEN (p.purchase_date + (pt.days || ' days')::interval)::date
    ELSE p.purchase_date
  END                                                     AS due_date,
  p.total_amount                                          AS purchase_total_amount,
  p.cash_price,
  COALESCE(p.cash_price_currency, p.currency)             AS currency,
  p.paid_at,
  (p.paid_at IS NOT NULL)                                 AS is_paid,
  CASE
    WHEN p.paid_at IS NOT NULL THEN 0
    ELSE COALESCE(p.cash_price, p.total_amount, 0)
  END::numeric                                            AS outstanding_amount,
  CASE
    WHEN p.paid_at IS NOT NULL THEN NULL
    WHEN pt.days IS NOT NULL
      THEN ((p.purchase_date + (pt.days || ' days')::interval)::date - CURRENT_DATE)
    ELSE (p.purchase_date - CURRENT_DATE)
  END                                                     AS days_until_due,
  (p.paid_at IS NULL
   AND CASE
         WHEN pt.days IS NOT NULL
           THEN (p.purchase_date + (pt.days || ' days')::interval)::date
         ELSE p.purchase_date
       END < CURRENT_DATE)                                AS is_overdue,
  NULL::text                                              AS product_summary,
  p.created_at
FROM public.purchases p
LEFT JOIN public.suppliers s     ON s.id = p.supplier_id
LEFT JOIN public.payment_terms pt ON pt.id = p.payment_term_id;

COMMENT ON VIEW public.vw_supplier_payables IS
  'Phase 18.1 — read-only payables: outstanding per purchase. Partial payments not modeled yet.';

-- =========================
-- RPC: receivables summary
-- =========================
CREATE OR REPLACE FUNCTION public.get_receivables_summary(
  p_from_date    date  DEFAULT NULL,
  p_to_date      date  DEFAULT NULL,
  p_customer_id  uuid  DEFAULT NULL
)
RETURNS TABLE (
  total_outstanding   numeric,
  overdue_outstanding numeric,
  due_today           numeric,
  due_tomorrow        numeric,
  future_outstanding  numeric,
  items_count         bigint
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

  RETURN QUERY
  SELECT
    COALESCE(SUM(v.outstanding_amount), 0)::numeric                                              AS total_outstanding,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.is_overdue), 0)::numeric                  AS overdue_outstanding,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = CURRENT_DATE), 0)::numeric     AS due_today,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = CURRENT_DATE + 1), 0)::numeric AS due_tomorrow,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date > CURRENT_DATE + 1), 0)::numeric AS future_outstanding,
    COUNT(*)::bigint                                                                              AS items_count
  FROM public.vw_customer_receivables v
  WHERE (p_customer_id IS NULL OR v.customer_id = p_customer_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date);
END;
$$;

REVOKE ALL ON FUNCTION public.get_receivables_summary(date,date,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_receivables_summary(date,date,uuid) TO authenticated;

-- =========================
-- RPC: payables summary
-- =========================
CREATE OR REPLACE FUNCTION public.get_payables_summary(
  p_from_date    date  DEFAULT NULL,
  p_to_date      date  DEFAULT NULL,
  p_supplier_id  uuid  DEFAULT NULL
)
RETURNS TABLE (
  total_outstanding   numeric,
  overdue_outstanding numeric,
  due_today           numeric,
  due_tomorrow        numeric,
  future_outstanding  numeric,
  items_count         bigint
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

  RETURN QUERY
  SELECT
    COALESCE(SUM(v.outstanding_amount), 0)::numeric                                              AS total_outstanding,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.is_overdue), 0)::numeric                  AS overdue_outstanding,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = CURRENT_DATE), 0)::numeric     AS due_today,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = CURRENT_DATE + 1), 0)::numeric AS due_tomorrow,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date > CURRENT_DATE + 1), 0)::numeric AS future_outstanding,
    COUNT(*)::bigint                                                                              AS items_count
  FROM public.vw_supplier_payables v
  WHERE v.is_paid = false
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date);
END;
$$;

REVOKE ALL ON FUNCTION public.get_payables_summary(date,date,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_payables_summary(date,date,uuid) TO authenticated;

-- =========================
-- Indexes (idempotent)
-- =========================
CREATE INDEX IF NOT EXISTS idx_invoices_customer_due
  ON public.invoices (customer_id, due_date);

CREATE INDEX IF NOT EXISTS idx_invoices_commitment_due
  ON public.invoices (commitment_confirmed, due_date)
  WHERE commitment_confirmed = true;

CREATE INDEX IF NOT EXISTS idx_prl_invoice
  ON public.payment_receipt_links (invoice_id);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_status
  ON public.payment_receipts (status);

CREATE INDEX IF NOT EXISTS idx_purchases_supplier_paid
  ON public.purchases (supplier_id, paid_at);

CREATE INDEX IF NOT EXISTS idx_purchases_payment_term
  ON public.purchases (payment_term_id);

CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date
  ON public.purchases (purchase_date);
