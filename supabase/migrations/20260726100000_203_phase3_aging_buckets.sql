-- Phase 3 — سطل‌بندی سنی (aging) برای مطالبات و بدهی‌ها
-- ستون `aging_bucket` به انتهای دو ویو اضافه می‌شود (CREATE OR REPLACE، بدون DROP)
-- و توابع خلاصه، جمع هر سطل را هم برمی‌گردانند.
-- سطل‌ها: current | d1_30 | d31_60 | d61_90 | d90_plus  (بر مبنای CURRENT_DATE - due_date)

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) vw_customer_receivables + aging_bucket (ستون جدید، در انتها)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_customer_receivables AS
 WITH paid_inv AS (
         SELECT prl.invoice_id AS doc_id,
            COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
           FROM payment_receipt_links prl
             JOIN payment_receipts pr ON pr.id = prl.receipt_id
          WHERE prl.invoice_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
          GROUP BY prl.invoice_id
        ), paid_quote AS (
         SELECT prl.quote_id AS doc_id,
            COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
           FROM payment_receipt_links prl
             JOIN payment_receipts pr ON pr.id = prl.receipt_id
          WHERE prl.quote_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
          GROUP BY prl.quote_id
        )
 SELECT i.customer_id,
    c.name AS customer_name,
    i.id AS invoice_id,
    i.number AS invoice_number,
    i.invoice_type,
    i.status AS invoice_status,
    i.due_date,
    i.total_amount,
    COALESCE(i.deposit_amount, 0::numeric) AS deposit_amount,
    COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
    GREATEST(i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
    i.commitment_confirmed,
        CASE
            WHEN i.due_date IS NOT NULL THEN i.due_date - CURRENT_DATE
            ELSE NULL::integer
        END AS days_until_due,
    i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE AND (i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
    i.created_at,
        CASE
            WHEN i.due_date IS NULL THEN 'current'::text
            WHEN CURRENT_DATE - i.due_date <= 0 THEN 'current'::text
            WHEN CURRENT_DATE - i.due_date <= 30 THEN 'd1_30'::text
            WHEN CURRENT_DATE - i.due_date <= 60 THEN 'd31_60'::text
            WHEN CURRENT_DATE - i.due_date <= 90 THEN 'd61_90'::text
            ELSE 'd90_plus'::text
        END AS aging_bucket
   FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     LEFT JOIN paid_inv p ON p.doc_id = i.id
  WHERE i.commitment_confirmed = true AND COALESCE(i.status, ''::text) <> 'cancelled'::text AND GREATEST(i.total_amount - COALESCE(i.deposit_amount, 0::numeric) - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric
UNION ALL
 SELECT q.customer_id,
    COALESCE(c.name, q.customer_name) AS customer_name,
    q.id AS invoice_id,
    q.quote_number AS invoice_number,
    'sales_quote'::text AS invoice_type,
    q.status::text AS invoice_status,
    q.expires_at::date AS due_date,
    q.final_amount::numeric(18,2) AS total_amount,
    0::numeric AS deposit_amount,
    COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
    GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
    true AS commitment_confirmed,
        CASE
            WHEN q.expires_at IS NOT NULL THEN q.expires_at::date - CURRENT_DATE
            ELSE NULL::integer
        END AS days_until_due,
    q.expires_at IS NOT NULL AND q.expires_at::date < CURRENT_DATE AND (q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
    q.created_at,
        CASE
            WHEN q.expires_at IS NULL THEN 'current'::text
            WHEN CURRENT_DATE - q.expires_at::date <= 0 THEN 'current'::text
            WHEN CURRENT_DATE - q.expires_at::date <= 30 THEN 'd1_30'::text
            WHEN CURRENT_DATE - q.expires_at::date <= 60 THEN 'd31_60'::text
            WHEN CURRENT_DATE - q.expires_at::date <= 90 THEN 'd61_90'::text
            ELSE 'd90_plus'::text
        END AS aging_bucket
   FROM sales_quotes q
     LEFT JOIN customers c ON c.id = q.customer_id
     LEFT JOIN paid_quote p ON p.doc_id = q.id
  WHERE q.status = 'accepted'::sales_quote_status AND GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric;

-- ---------------------------------------------------------------------------
-- 2) vw_supplier_payables + aging_bucket
--    سررسید = purchase_date + payment_terms.days (همان منطق ستون due_date موجود)
--    فاکتور پرداخت‌شده در سطل 'current' می‌ماند تا آمار سنی را منحرف نکند.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_supplier_payables AS
 SELECT p.supplier_id,
    s.name AS supplier_name,
    p.id AS purchase_id,
    p.purchase_date,
    pt.days AS payment_term_days,
        CASE
            WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
            ELSE p.purchase_date
        END AS due_date,
    p.total_amount AS purchase_total_amount,
    p.cash_price,
    COALESCE(p.cash_price_currency, p.currency) AS currency,
    p.paid_at,
    p.paid_at IS NOT NULL AS is_paid,
        CASE
            WHEN p.paid_at IS NOT NULL THEN 0::numeric
            ELSE COALESCE(p.cash_price, p.total_amount, 0::numeric)
        END AS outstanding_amount,
        CASE
            WHEN p.paid_at IS NOT NULL THEN NULL::integer
            WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date - CURRENT_DATE
            ELSE p.purchase_date - CURRENT_DATE
        END AS days_until_due,
    p.paid_at IS NULL AND
        CASE
            WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
            ELSE p.purchase_date
        END < CURRENT_DATE AS is_overdue,
    NULL::text AS product_summary,
    p.created_at,
        CASE
            WHEN p.paid_at IS NOT NULL THEN 'current'::text
            WHEN CURRENT_DATE -
                CASE
                    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                    ELSE p.purchase_date
                END <= 0 THEN 'current'::text
            WHEN CURRENT_DATE -
                CASE
                    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                    ELSE p.purchase_date
                END <= 30 THEN 'd1_30'::text
            WHEN CURRENT_DATE -
                CASE
                    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                    ELSE p.purchase_date
                END <= 60 THEN 'd31_60'::text
            WHEN CURRENT_DATE -
                CASE
                    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                    ELSE p.purchase_date
                END <= 90 THEN 'd61_90'::text
            ELSE 'd90_plus'::text
        END AS aging_bucket
   FROM purchases p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN payment_terms pt ON pt.id = p.payment_term_id;

-- ---------------------------------------------------------------------------
-- 3) get_receivables_summary — افزودن جمع سطل‌های سنی
--    (تغییر RETURNS TABLE نیازمند DROP است؛ تابع فقط خواندنی است، دادهٔ ندارد)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_receivables_summary(date, date, uuid);

CREATE FUNCTION public.get_receivables_summary(
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT NULL::date,
  p_customer_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  total_outstanding numeric,
  overdue_outstanding numeric,
  due_today numeric,
  due_tomorrow numeric,
  future_outstanding numeric,
  items_count bigint,
  bucket_current numeric,
  bucket_d1_30 numeric,
  bucket_d31_60 numeric,
  bucket_d61_90 numeric,
  bucket_d90_plus numeric,
  count_current bigint,
  count_d1_30 bigint,
  count_d31_60 bigint,
  count_d61_90 bigint,
  count_d90_plus bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(v.outstanding_amount), 0)::numeric                                              AS total_outstanding,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.is_overdue), 0)::numeric                  AS overdue_outstanding,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = CURRENT_DATE), 0)::numeric     AS due_today,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = CURRENT_DATE + 1), 0)::numeric AS due_tomorrow,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date > CURRENT_DATE + 1), 0)::numeric AS future_outstanding,
    COUNT(*)::bigint                                                                             AS items_count,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'current'), 0)::numeric    AS bucket_current,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'd1_30'), 0)::numeric      AS bucket_d1_30,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'd31_60'), 0)::numeric     AS bucket_d31_60,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'd61_90'), 0)::numeric     AS bucket_d61_90,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'd90_plus'), 0)::numeric   AS bucket_d90_plus,
    COUNT(*) FILTER (WHERE v.aging_bucket = 'current')::bigint                                   AS count_current,
    COUNT(*) FILTER (WHERE v.aging_bucket = 'd1_30')::bigint                                     AS count_d1_30,
    COUNT(*) FILTER (WHERE v.aging_bucket = 'd31_60')::bigint                                    AS count_d31_60,
    COUNT(*) FILTER (WHERE v.aging_bucket = 'd61_90')::bigint                                    AS count_d61_90,
    COUNT(*) FILTER (WHERE v.aging_bucket = 'd90_plus')::bigint                                  AS count_d90_plus
  FROM public.vw_customer_receivables v
  WHERE (p_customer_id IS NULL OR v.customer_id = p_customer_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_receivables_summary(date, date, uuid)
  TO anon, authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- 4) get_payables_summary — افزودن جمع سطل‌های سنی
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_payables_summary(date, date, uuid);

CREATE FUNCTION public.get_payables_summary(
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT NULL::date,
  p_supplier_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  total_outstanding numeric,
  overdue_outstanding numeric,
  due_today numeric,
  due_tomorrow numeric,
  future_outstanding numeric,
  items_count bigint,
  bucket_current numeric,
  bucket_d1_30 numeric,
  bucket_d31_60 numeric,
  bucket_d61_90 numeric,
  bucket_d90_plus numeric,
  count_current bigint,
  count_d1_30 bigint,
  count_d31_60 bigint,
  count_d61_90 bigint,
  count_d90_plus bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(v.outstanding_amount), 0)::numeric                                              AS total_outstanding,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.is_overdue), 0)::numeric                  AS overdue_outstanding,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = CURRENT_DATE), 0)::numeric     AS due_today,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = CURRENT_DATE + 1), 0)::numeric AS due_tomorrow,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date > CURRENT_DATE + 1), 0)::numeric AS future_outstanding,
    COUNT(*)::bigint                                                                             AS items_count,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'current'), 0)::numeric    AS bucket_current,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'd1_30'), 0)::numeric      AS bucket_d1_30,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'd31_60'), 0)::numeric     AS bucket_d31_60,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'd61_90'), 0)::numeric     AS bucket_d61_90,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'd90_plus'), 0)::numeric   AS bucket_d90_plus,
    COUNT(*) FILTER (WHERE v.aging_bucket = 'current')::bigint                                   AS count_current,
    COUNT(*) FILTER (WHERE v.aging_bucket = 'd1_30')::bigint                                     AS count_d1_30,
    COUNT(*) FILTER (WHERE v.aging_bucket = 'd31_60')::bigint                                    AS count_d31_60,
    COUNT(*) FILTER (WHERE v.aging_bucket = 'd61_90')::bigint                                    AS count_d61_90,
    COUNT(*) FILTER (WHERE v.aging_bucket = 'd90_plus')::bigint                                  AS count_d90_plus
  FROM public.vw_supplier_payables v
  WHERE v.is_paid = false
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_payables_summary(date, date, uuid)
  TO anon, authenticated, service_role, postgres;

COMMIT;
