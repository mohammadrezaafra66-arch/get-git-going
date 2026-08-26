SET client_encoding='UTF8';

-- 396 — OG-64: the four bucketing filters and the staff-metric guard stop asking UTC what
-- "today" is, and so do the two things that would otherwise have made those fixes useless.
--
-- OG-63 fixed create_purchase; this closes the part of its class that the owner scoped in.
-- Between 00:00 and 03:30 Tehran, CURRENT_DATE is still YESTERDAY, because it is evaluated
-- in UTC. public.tehran_today() is STABLE and returns (now() AT TIME ZONE 'Asia/Tehran')::date.
--
-- WHY THIS MIGRATION IS LARGER THAN THE FIVE FUNCTIONS IT WAS SCOPED TO.
-- The audit behind OG-64 enumerated pg_proc. Two other kinds of object carry the same
-- comparison, were invisible to that query, and each one independently defeats the fix it
-- sits behind:
--
--   (1) THE VIEWS. get_payables_list / get_receivables_list and their summaries select
--       is_overdue, days_until_due and aging_bucket from vw_supplier_payables and
--       vw_customer_receivables, which compute all three from CURRENT_DATE. Fixing only the
--       functions produces a row that CONTRADICTS ITSELF on screen: inside the window an item
--       due today-in-Tehran would be listed under «امروز» by the fixed filter while the same
--       row reports days_until_due = 1 from the unfixed view. Worse, an item that IS overdue
--       in Tehran is not yet overdue in UTC, so it appears in no bucket at all.
--
--   (2) THE RLS POLICIES. staff_daily_performance_metrics carries
--       sdpm_insert_privileged (WITH CHECK metric_date <= CURRENT_DATE) and
--       sdpm_update_privileged (metric_date >= CURRENT_DATE - 5 days). The function's own
--       guard is NOT the gate that refuses the write — the policy is. Fixing line 21 alone
--       would let the call past the function's clean Persian message and straight into a
--       row-level-security violation: the same refusal, with a WORSE error. The function and
--       the policy have to move together or not at all.
--
-- Bodies are byte-for-byte copies of the LIVE definitions (pg_get_functiondef /
-- pg_get_viewdef, captured 2026-08-26), with only the CURRENT_DATE tokens substituted by
-- script — 27 of them, 13 in the views, 12 in the functions, 2 in the metric guard. Nothing
-- else in any body was touched, per the rule that the database may hold an older definition
-- than git.
--
-- NOT CHANGED, and deliberately so:
--   * The 16 remaining CURRENT_DATE functions are assessed in docs/research, not converted.
--   * The 7 column DEFAULTs (journal_entries.entry_date, purchases.purchase_date, ...) are
--     left alone. purchases' default never fires — create_purchase rejects a NULL date and
--     passes p_purchase_date explicitly — and changing a default is a wider blast radius than
--     this mission was scoped for.
--   * The two birth_date_not_future CHECK constraints: a UTC "not in the future" is if
--     anything more permissive for 3.5 hours, never more restrictive, so it refuses nothing.

-- vw_supplier_payables: 7 occurrences replaced
CREATE OR REPLACE VIEW public.vw_supplier_payables AS
 SELECT src.supplier_id,
    src.supplier_name,
    src.purchase_id,
    src.purchase_date,
    src.payment_term_days,
    src.due_date,
    src.purchase_total_amount,
    src.cash_price,
    src.currency,
    src.paid_at,
    src.is_paid,
    src.outstanding_amount,
    src.days_until_due,
    src.is_overdue,
    src.product_summary,
    src.created_at,
    src.aging_bucket
   FROM ( SELECT p.supplier_id,
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
                    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date - public.tehran_today()
                    ELSE p.purchase_date - public.tehran_today()
                END AS days_until_due,
            p.paid_at IS NULL AND
                CASE
                    WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                    ELSE p.purchase_date
                END < public.tehran_today() AS is_overdue,
            NULL::text AS product_summary,
            p.created_at,
                CASE
                    WHEN p.paid_at IS NOT NULL THEN 'current'::text
                    WHEN (public.tehran_today() -
                    CASE
                        WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                        ELSE p.purchase_date
                    END) <= 0 THEN 'current'::text
                    WHEN (public.tehran_today() -
                    CASE
                        WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                        ELSE p.purchase_date
                    END) <= 30 THEN 'd1_30'::text
                    WHEN (public.tehran_today() -
                    CASE
                        WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                        ELSE p.purchase_date
                    END) <= 60 THEN 'd31_60'::text
                    WHEN (public.tehran_today() -
                    CASE
                        WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                        ELSE p.purchase_date
                    END) <= 90 THEN 'd61_90'::text
                    ELSE 'd90_plus'::text
                END AS aging_bucket
           FROM purchases p
             LEFT JOIN suppliers s ON s.id = p.supplier_id
             LEFT JOIN payment_terms pt ON pt.id = p.payment_term_id) src
  WHERE auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid());

-- vw_customer_receivables: 6 occurrences replaced
CREATE OR REPLACE VIEW public.vw_customer_receivables AS
 SELECT src.customer_id,
    src.customer_name,
    src.invoice_id,
    src.invoice_number,
    src.invoice_type,
    src.invoice_status,
    src.due_date,
    src.total_amount,
    src.deposit_amount,
    src.confirmed_paid_amount,
    src.outstanding_amount,
    src.commitment_confirmed,
    src.days_until_due,
    src.is_overdue,
    src.created_at,
    src.aging_bucket
   FROM ( WITH paid_quote AS (
                 SELECT prl.quote_id AS doc_id,
                    COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
                   FROM payment_receipt_links prl
                     JOIN payment_receipts pr ON pr.id = prl.receipt_id
                  WHERE prl.quote_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
                  GROUP BY prl.quote_id
                )
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
                    WHEN q.expires_at IS NOT NULL THEN q.expires_at::date - public.tehran_today()
                    ELSE NULL::integer
                END AS days_until_due,
            q.expires_at IS NOT NULL AND q.expires_at::date < public.tehran_today() AND (q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
            q.created_at,
                CASE
                    WHEN q.expires_at IS NULL THEN 'current'::text
                    WHEN (public.tehran_today() - q.expires_at::date) <= 0 THEN 'current'::text
                    WHEN (public.tehran_today() - q.expires_at::date) <= 30 THEN 'd1_30'::text
                    WHEN (public.tehran_today() - q.expires_at::date) <= 60 THEN 'd31_60'::text
                    WHEN (public.tehran_today() - q.expires_at::date) <= 90 THEN 'd61_90'::text
                    ELSE 'd90_plus'::text
                END AS aging_bucket
           FROM sales_quotes q
             LEFT JOIN customers c ON c.id = q.customer_id
             LEFT JOIN paid_quote p ON p.doc_id = q.id
          WHERE q.status = 'accepted'::sales_quote_status AND GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric) src
  WHERE auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid());

-- get_payables_list: 3 occurrences replaced
CREATE OR REPLACE FUNCTION public.get_payables_list(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_supplier_id uuid DEFAULT NULL::uuid, p_due_filter text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_include_paid boolean DEFAULT false)
 RETURNS TABLE(supplier_id uuid, supplier_name text, purchase_id uuid, purchase_date date, due_date date, payment_term_days integer, purchase_total_amount numeric, cash_price numeric, currency text, paid_at timestamp with time zone, outstanding_amount numeric, is_paid boolean, days_until_due integer, is_overdue boolean, product_summary text, created_at timestamp with time zone, aging_bucket text)
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
      OR (v_filter = 'today'    AND v.due_date = public.tehran_today())
      OR (v_filter = 'tomorrow' AND v.due_date = public.tehran_today() + 1)
      OR (v_filter = 'future'   AND v.due_date > public.tehran_today() + 1)
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

-- get_receivables_list: 3 occurrences replaced
CREATE OR REPLACE FUNCTION public.get_receivables_list(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_customer_id uuid DEFAULT NULL::uuid, p_due_filter text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(customer_id uuid, customer_name text, invoice_id uuid, invoice_number text, invoice_type text, invoice_status text, due_date date, total_amount numeric, deposit_amount numeric, confirmed_paid_amount numeric, outstanding_amount numeric, days_until_due integer, is_overdue boolean, created_at timestamp with time zone, aging_bucket text)
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
      OR (v_filter = 'today'    AND v.due_date = public.tehran_today())
      OR (v_filter = 'tomorrow' AND v.due_date = public.tehran_today() + 1)
      OR (v_filter = 'future'   AND v.due_date > public.tehran_today() + 1)
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

-- get_payables_summary: 3 occurrences replaced
CREATE OR REPLACE FUNCTION public.get_payables_summary(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_supplier_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_outstanding numeric, overdue_outstanding numeric, due_today numeric, due_tomorrow numeric, future_outstanding numeric, items_count bigint, bucket_current numeric, bucket_d1_30 numeric, bucket_d31_60 numeric, bucket_d61_90 numeric, bucket_d90_plus numeric, count_current bigint, count_d1_30 bigint, count_d31_60 bigint, count_d61_90 bigint, count_d90_plus bigint)
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
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = public.tehran_today()), 0)::numeric     AS due_today,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = public.tehran_today() + 1), 0)::numeric AS due_tomorrow,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date > public.tehran_today() + 1), 0)::numeric AS future_outstanding,
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

-- get_receivables_summary: 3 occurrences replaced
CREATE OR REPLACE FUNCTION public.get_receivables_summary(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_outstanding numeric, overdue_outstanding numeric, due_today numeric, due_tomorrow numeric, future_outstanding numeric, items_count bigint, bucket_current numeric, bucket_d1_30 numeric, bucket_d31_60 numeric, bucket_d61_90 numeric, bucket_d90_plus numeric, count_current bigint, count_d1_30 bigint, count_d31_60 bigint, count_d61_90 bigint, count_d90_plus bigint)
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
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = public.tehran_today()), 0)::numeric     AS due_today,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = public.tehran_today() + 1), 0)::numeric AS due_tomorrow,
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date > public.tehran_today() + 1), 0)::numeric AS future_outstanding,
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

-- upsert_staff_daily_performance_metric: 2 occurrences replaced
CREATE OR REPLACE FUNCTION public.upsert_staff_daily_performance_metric(p_staff_user_id uuid, p_metric_date date, p_sales_amount numeric, p_profit_amount numeric, p_inbound_calls_count integer, p_outbound_calls_count integer, p_talk_time_minutes integer, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  IF NOT public.has_any_role(v_uid,
       ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای ثبت عملکرد روزانه';
  END IF;

  v_is_admin := public.has_role(v_uid, 'admin');

  IF p_metric_date IS NULL OR p_metric_date > public.tehran_today() THEN
    RAISE EXCEPTION 'تاریخ نامعتبر است؛ ثبت برای آینده مجاز نیست';
  END IF;

  -- 5-day window. Admin may override for corrections.
  IF p_metric_date < public.tehran_today() - INTERVAL '5 days' AND NOT v_is_admin THEN
    RAISE EXCEPTION 'ویرایش فقط تا ۵ روز گذشته مجاز است';
  END IF;

  IF COALESCE(p_sales_amount,0) < 0
     OR COALESCE(p_inbound_calls_count,0) < 0
     OR COALESCE(p_outbound_calls_count,0) < 0
     OR COALESCE(p_talk_time_minutes,0) < 0 THEN
    RAISE EXCEPTION 'مقادیر نمی‌توانند منفی باشند';
  END IF;

  INSERT INTO public.staff_daily_performance_metrics AS m
    (metric_date, staff_user_id, sales_amount, profit_amount,
     inbound_calls_count, outbound_calls_count, talk_time_minutes,
     notes, created_by, updated_by)
  VALUES
    (p_metric_date, p_staff_user_id, COALESCE(p_sales_amount,0), COALESCE(p_profit_amount,0),
     COALESCE(p_inbound_calls_count,0), COALESCE(p_outbound_calls_count,0),
     COALESCE(p_talk_time_minutes,0), NULLIF(btrim(COALESCE(p_notes,'')), ''), v_uid, v_uid)
  ON CONFLICT (metric_date, staff_user_id) DO UPDATE
    SET sales_amount         = EXCLUDED.sales_amount,
        profit_amount        = EXCLUDED.profit_amount,
        inbound_calls_count  = EXCLUDED.inbound_calls_count,
        outbound_calls_count = EXCLUDED.outbound_calls_count,
        talk_time_minutes    = EXCLUDED.talk_time_minutes,
        notes                = EXCLUDED.notes,
        updated_by           = v_uid,
        updated_at           = now()
  RETURNING m.id INTO v_id;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (v_uid, 'staff_daily_performance_metric', v_id::text,
          'staff_daily_metric_upserted',
          jsonb_build_object(
            'staff_user_id', p_staff_user_id,
            'metric_date', p_metric_date,
            'sales_amount', COALESCE(p_sales_amount,0),
            'profit_amount', COALESCE(p_profit_amount,0),
            'inbound_calls_count', COALESCE(p_inbound_calls_count,0),
            'outbound_calls_count', COALESCE(p_outbound_calls_count,0),
            'talk_time_minutes', COALESCE(p_talk_time_minutes,0)));

  -- Recalculate this employee's score. Never let a scoring failure roll back
  -- the metric itself.
  BEGIN
    PERFORM public.calculate_employee_score(p_staff_user_id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
    VALUES (v_uid, 'staff_daily_performance_metric', v_id::text,
            'score_recalc_failed', jsonb_build_object('error', SQLERRM));
  END;

  RETURN v_id;
END;
$function$;

-- The RLS policies on staff_daily_performance_metrics. ALTER POLICY rather than DROP+CREATE:
-- it never leaves the table unprotected, not even inside this transaction.
ALTER POLICY sdpm_insert_privileged ON public.staff_daily_performance_metrics
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])
    AND (metric_date >= (public.tehran_today() - '5 days'::interval))
    AND (metric_date <= public.tehran_today())
  );

ALTER POLICY sdpm_update_privileged ON public.staff_daily_performance_metrics
  USING (
    has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])
    AND (metric_date >= (public.tehran_today() - '5 days'::interval))
  )
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role])
    AND (metric_date >= (public.tehran_today() - '5 days'::interval))
  );

-- Assertions. This migration is worthless if it lands PARTIALLY, so it proves itself before
-- committing: every object it claims to convert must show zero CURRENT_DATE and a real
-- tehran_today() reference. Counting only the absence would pass a body that lost the
-- comparison altogether.
DO $verify$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(name, ', ') INTO v_bad FROM (
    SELECT p.proname AS name, pg_get_functiondef(p.oid) AS src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN
       ('get_payables_list','get_receivables_list','get_payables_summary',
        'get_receivables_summary','upsert_staff_daily_performance_metric')
    UNION ALL
    SELECT v.viewname, v.definition FROM pg_views v
     WHERE v.schemaname = 'public'
       AND v.viewname IN ('vw_supplier_payables','vw_customer_receivables')
  ) s WHERE s.src ~* 'CURRENT_DATE' OR s.src !~* 'tehran_today';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '396: still UTC-bound or lost the comparison: %', v_bad;
  END IF;

  SELECT string_agg(pol.polname, ', ') INTO v_bad
    FROM pg_policy pol
   WHERE pol.polrelid = 'public.staff_daily_performance_metrics'::regclass
     AND pol.polname IN ('sdpm_insert_privileged','sdpm_update_privileged')
     AND (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
          || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~* 'CURRENT_DATE';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '396: policy still UTC-bound: %', v_bad;
  END IF;

  -- The whole point, stated as an executable claim rather than a comment.
  --
  -- An earlier draft asserted this by "reconstructing the window" with a single
  -- SET TimeZone='Etc/GMT+12' and checking that tehran_today() <> CURRENT_DATE. That gate is
  -- TIME-OF-DAY DEPENDENT and it failed here at 18:30 Tehran, because at UTC-12 the local
  -- date still happened to match. A gate that only fires during certain hours would pass
  -- vacuously for most of the day and could not be trusted by whoever runs it next.
  --
  -- This asserts the PROPERTY instead, and it holds at every hour: UTC-12 and UTC+14 are 26
  -- hours apart, and 26 > 24, so their local dates ALWAYS differ. CURRENT_DATE must move
  -- between them; tehran_today() must not move at all.
  DECLARE
    v_cd_west date; v_cd_east date; v_th_west date; v_th_east date;
  BEGIN
    PERFORM set_config('TimeZone', 'Etc/GMT+12', true);   -- UTC-12
    v_cd_west := CURRENT_DATE; v_th_west := public.tehran_today();
    PERFORM set_config('TimeZone', 'Etc/GMT-14', true);   -- UTC+14
    v_cd_east := CURRENT_DATE; v_th_east := public.tehran_today();
    PERFORM set_config('TimeZone', 'UTC', true);

    IF v_cd_west = v_cd_east THEN
      RAISE EXCEPTION '396: CURRENT_DATE did not move across a 26-hour offset (% vs %); the gate proves nothing',
        v_cd_west, v_cd_east;
    END IF;
    IF v_th_west <> v_th_east THEN
      RAISE EXCEPTION '396: tehran_today() moved with the session timezone (% vs %); it is not the fixed point this migration relies on',
        v_th_west, v_th_east;
    END IF;
  END;
END
$verify$;

