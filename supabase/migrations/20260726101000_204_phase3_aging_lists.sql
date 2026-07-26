-- Phase 3 (ادامه) — افزودن aging_bucket به توابع لیست + امکان فیلتر بر اساس سطل سنی
-- ستون `aging_bucket` به انتهای خروجی هر دو تابع اضافه می‌شود و
-- `p_due_filter` علاوه بر مقادیر قبلی، مقادیر سطل سنی را هم می‌پذیرد.

BEGIN;

-- ---------------------------------------------------------------------------
-- get_receivables_list
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_receivables_list(date, date, uuid, text, text, integer, integer);

CREATE FUNCTION public.get_receivables_list(
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT NULL::date,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_due_filter text DEFAULT 'all'::text,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  customer_id uuid,
  customer_name text,
  invoice_id uuid,
  invoice_number text,
  invoice_type text,
  invoice_status text,
  due_date date,
  total_amount numeric,
  deposit_amount numeric,
  confirmed_paid_amount numeric,
  outstanding_amount numeric,
  days_until_due integer,
  is_overdue boolean,
  created_at timestamp with time zone,
  aging_bucket text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int  := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_filter text := COALESCE(p_due_filter, 'all');
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_filter NOT IN ('all','overdue','today','tomorrow','future',
                      'current','d1_30','d31_60','d61_90','d90_plus') THEN
    RAISE EXCEPTION 'invalid due filter: %', v_filter USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.customer_id, v.customer_name, v.invoice_id, v.invoice_number,
    v.invoice_type, v.invoice_status, v.due_date, v.total_amount,
    v.deposit_amount, v.confirmed_paid_amount, v.outstanding_amount,
    v.days_until_due, v.is_overdue, v.created_at, v.aging_bucket
  FROM public.vw_customer_receivables v
  WHERE (p_customer_id IS NULL OR v.customer_id = p_customer_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date)
    AND (
      v_filter = 'all'
      OR (v_filter = 'overdue'  AND v.is_overdue)
      OR (v_filter = 'today'    AND v.due_date = CURRENT_DATE)
      OR (v_filter = 'tomorrow' AND v.due_date = CURRENT_DATE + 1)
      OR (v_filter = 'future'   AND v.due_date > CURRENT_DATE + 1)
      OR (v_filter IN ('current','d1_30','d31_60','d61_90','d90_plus')
          AND v.aging_bucket = v_filter)
    )
    AND (
      v_search IS NULL
      OR v.customer_name  ILIKE '%'||v_search||'%'
      OR v.invoice_number ILIKE '%'||v_search||'%'
    )
  ORDER BY v.is_overdue DESC, v.due_date NULLS LAST, v.outstanding_amount DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_receivables_list(date, date, uuid, text, text, integer, integer)
  TO anon, authenticated, service_role, postgres;

-- ---------------------------------------------------------------------------
-- get_payables_list
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_payables_list(date, date, uuid, text, text, integer, integer, boolean);

CREATE FUNCTION public.get_payables_list(
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT NULL::date,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_due_filter text DEFAULT 'all'::text,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_include_paid boolean DEFAULT false
)
RETURNS TABLE(
  supplier_id uuid,
  supplier_name text,
  purchase_id uuid,
  purchase_date date,
  due_date date,
  payment_term_days integer,
  purchase_total_amount numeric,
  cash_price numeric,
  currency text,
  paid_at timestamp with time zone,
  outstanding_amount numeric,
  is_paid boolean,
  days_until_due integer,
  is_overdue boolean,
  product_summary text,
  created_at timestamp with time zone,
  aging_bucket text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int  := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_filter text := COALESCE(p_due_filter, 'all');
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_filter NOT IN ('all','overdue','today','tomorrow','future',
                      'current','d1_30','d31_60','d61_90','d90_plus') THEN
    RAISE EXCEPTION 'invalid due filter: %', v_filter USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.supplier_id, v.supplier_name, v.purchase_id, v.purchase_date, v.due_date,
    v.payment_term_days, v.purchase_total_amount, v.cash_price, v.currency,
    v.paid_at, v.outstanding_amount, v.is_paid, v.days_until_due, v.is_overdue,
    v.product_summary, v.created_at, v.aging_bucket
  FROM public.vw_supplier_payables v
  WHERE (p_include_paid OR v.is_paid = false)
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date)
    AND (
      v_filter = 'all'
      OR (v_filter = 'overdue'  AND v.is_overdue)
      OR (v_filter = 'today'    AND v.due_date = CURRENT_DATE)
      OR (v_filter = 'tomorrow' AND v.due_date = CURRENT_DATE + 1)
      OR (v_filter = 'future'   AND v.due_date > CURRENT_DATE + 1)
      OR (v_filter IN ('current','d1_30','d31_60','d61_90','d90_plus')
          AND v.aging_bucket = v_filter)
    )
    AND (
      v_search IS NULL
      OR v.supplier_name    ILIKE '%'||v_search||'%'
      OR v.purchase_id::text ILIKE '%'||v_search||'%'
    )
  ORDER BY v.is_overdue DESC, v.due_date NULLS LAST, v.outstanding_amount DESC
  LIMIT v_limit OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_payables_list(date, date, uuid, text, text, integer, integer, boolean)
  TO anon, authenticated, service_role, postgres;

COMMIT;
