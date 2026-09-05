SET client_encoding='UTF8';

-- 419. The receivables report shows a real settlement due date.
--
-- WHAT IT SHOWED BEFORE. Measured live under an admin JWT, immediately before this migration:
--
--   invoice_number | due_date | days_until_due | is_overdue | aging_bucket
--   SQ-2026-000004 | NULL     | NULL           | f          | current
--   SQ-2026-000005 | NULL     | NULL           | f          | current
--   SQ-2026-000024 | NULL     | NULL           | f          | current
--   SQ-2026-000233 | NULL     | NULL           | f          | current
--   SQ-2026-000235 | NULL     | NULL           | f          | current
--   SQ-2026-000236 | NULL     | NULL           | f          | current
--   SQ-2026-000237 | NULL     | NULL           | f          | current
--   SQ-2026-000238 | NULL     | NULL           | f          | current
--
-- Eight rows, not one due date, nothing overdue, everything filed as 'current' no matter how old.
-- The cause: due_date was q.expires_at, the quote's VALIDITY deadline, which is NULL on every
-- accepted quote -- and days_until_due, is_overdue and aging_bucket all derived from it, so one
-- wrong source silently disabled the entire report.
--
-- The purchase side has been correct all along, and this copies its shape rather than inventing
-- one (vw_supplier_payables):
--     WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days')::interval))::date
-- The anchor here is accepted_at (added by 417, backfilled by 418) instead of purchase_date,
-- because the settlement clock starts when the customer says yes.
--
-- THE THREE CASES, as the owner decided them:
--
--   active   AND days = 0  -> normal due date, no flag. days=0 on an active type is a real
--                             business value: پیش واریز(نقدی) genuinely means same-day.
--   inactive AND days > 0  -> normal due date, flagged. The number is trustworthy; the type
--                             merely is not on offer any more.
--   inactive AND days = 0  -> NO due date. A 0 on a type nobody maintains means nobody ever set
--                             it, not "same day". Showing the acceptance date would produce a
--                             wrong number carrying a reassuring label, and the accountant reads
--                             the number, not the label. SQ-2026-000005 is the live instance.
--
-- A missing accepted_at, or a quote with no settlement type at all, produce no due date either.
-- Nothing here ever substitutes today or created_at for a date it does not know.
--
-- WHY THE FUNCTIONS ARE DROPPED AND REBUILT RATHER THAN REPLACED. get_receivables_list and
-- get_receivable_detail enumerate their columns in RETURNS TABLE, and CREATE OR REPLACE cannot
-- change a return type. Their previous definitions are preserved verbatim in the recovery block
-- below, exactly as pg_get_functiondef printed them, so the previous state is recoverable by hand.
--
-- get_receivables_summary is NOT touched: it returns only aggregates and reads is_overdue,
-- due_date and aging_bucket from the view, so it picks up the new values with no signature change.
-- get_receivable_detail IS touched, and that is a judgement call worth stating plainly: without it
-- the list would say «سررسید نامشخص» while the drill-down the accountant opens to find out why
-- showed an empty date and no reason at all.
--
-- PostgREST caches RPC signatures at startup, so afrakala-lan-rest must be restarted after this.

-- =====================================================================================
-- RECOVERY BLOCK
-- =====================================================================================
-- ---- vw_customer_receivables, as pg_get_viewdef printed it before 419 ----
--    SELECT src.customer_id,
--       src.customer_name,
--       src.invoice_id,
--       src.invoice_number,
--       src.invoice_type,
--       src.invoice_status,
--       src.due_date,
--       src.total_amount,
--       src.deposit_amount,
--       src.confirmed_paid_amount,
--       src.outstanding_amount,
--       src.commitment_confirmed,
--       src.days_until_due,
--       src.is_overdue,
--       src.created_at,
--       src.aging_bucket
--      FROM ( WITH paid_quote AS (
--                    SELECT prl.quote_id AS doc_id,
--                       COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
--                      FROM payment_receipt_links prl
--                        JOIN payment_receipts pr ON pr.id = prl.receipt_id
--                     WHERE prl.quote_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
--                     GROUP BY prl.quote_id
--                   )
--            SELECT q.customer_id,
--               COALESCE(c.name, q.customer_name) AS customer_name,
--               q.id AS invoice_id,
--               q.quote_number AS invoice_number,
--               'sales_quote'::text AS invoice_type,
--               q.status::text AS invoice_status,
--               q.expires_at::date AS due_date,
--               q.final_amount::numeric(18,2) AS total_amount,
--               0::numeric AS deposit_amount,
--               COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
--               GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
--               true AS commitment_confirmed,
--                   CASE
--                       WHEN q.expires_at IS NOT NULL THEN q.expires_at::date - tehran_today()
--                       ELSE NULL::integer
--                   END AS days_until_due,
--               q.expires_at IS NOT NULL AND q.expires_at::date < tehran_today() AND (q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
--               q.created_at,
--                   CASE
--                       WHEN q.expires_at IS NULL THEN 'current'::text
--                       WHEN (tehran_today() - q.expires_at::date) <= 0 THEN 'current'::text
--                       WHEN (tehran_today() - q.expires_at::date) <= 30 THEN 'd1_30'::text
--                       WHEN (tehran_today() - q.expires_at::date) <= 60 THEN 'd31_60'::text
--                       WHEN (tehran_today() - q.expires_at::date) <= 90 THEN 'd61_90'::text
--                       ELSE 'd90_plus'::text
--                   END AS aging_bucket
--              FROM sales_quotes q
--                LEFT JOIN customers c ON c.id = q.customer_id
--                LEFT JOIN paid_quote p ON p.doc_id = q.id
--             WHERE q.status = 'accepted'::sales_quote_status AND GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric) src
--     WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());
--
-- ---- get_receivables_list, as pg_get_functiondef printed it before 419 ----
--   CREATE OR REPLACE FUNCTION public.get_receivables_list(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_customer_id uuid DEFAULT NULL::uuid, p_due_filter text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
--    RETURNS TABLE(customer_id uuid, customer_name text, invoice_id uuid, invoice_number text, invoice_type text, invoice_status text, due_date date, total_amount numeric, deposit_amount numeric, confirmed_paid_amount numeric, outstanding_amount numeric, days_until_due integer, is_overdue boolean, created_at timestamp with time zone, aging_bucket text)
--    LANGUAGE plpgsql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
--     v_offset int  := GREATEST(COALESCE(p_offset, 0), 0);
--     v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
--     v_filter text := COALESCE(p_due_filter, 'all');
--   BEGIN
--     IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
--       RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
--     END IF;
--   
--     IF v_filter NOT IN ('all','overdue','today','tomorrow','future',
--                         'current','d1_30','d31_60','d61_90','d90_plus') THEN
--       RAISE EXCEPTION 'invalid due filter: %', v_filter USING ERRCODE = '22023';
--     END IF;
--   
--     RETURN QUERY
--     SELECT
--       v.customer_id, v.customer_name, v.invoice_id, v.invoice_number,
--       v.invoice_type, v.invoice_status, v.due_date, v.total_amount,
--       v.deposit_amount, v.confirmed_paid_amount, v.outstanding_amount,
--       v.days_until_due, v.is_overdue, v.created_at, v.aging_bucket
--     FROM public.vw_customer_receivables v
--     WHERE (p_customer_id IS NULL OR v.customer_id = p_customer_id)
--       AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
--       AND (p_to_date     IS NULL OR v.due_date   <= p_to_date)
--       AND (
--         v_filter = 'all'
--         OR (v_filter = 'overdue'  AND v.is_overdue)
--         OR (v_filter = 'today'    AND v.due_date = public.tehran_today())
--         OR (v_filter = 'tomorrow' AND v.due_date = public.tehran_today() + 1)
--         OR (v_filter = 'future'   AND v.due_date > public.tehran_today() + 1)
--         OR (v_filter IN ('current','d1_30','d31_60','d61_90','d90_plus')
--             AND v.aging_bucket = v_filter)
--       )
--       AND (
--         v_search IS NULL
--         OR v.customer_name  ILIKE '%'||v_search||'%'
--         OR v.invoice_number ILIKE '%'||v_search||'%'
--       )
--     ORDER BY v.is_overdue DESC, v.due_date NULLS LAST, v.outstanding_amount DESC
--     LIMIT v_limit OFFSET v_offset;
--   END;
--   $function$
--   
--
-- ---- get_receivable_detail, as pg_get_functiondef printed it before 419 ----
--   CREATE OR REPLACE FUNCTION public.get_receivable_detail(p_customer_id uuid DEFAULT NULL::uuid, p_invoice_id uuid DEFAULT NULL::uuid)
--    RETURNS TABLE(customer_id uuid, customer_name text, customer_phone text, invoice_id uuid, invoice_number text, invoice_type text, invoice_status text, issue_date date, due_date date, total_amount numeric, deposit_amount numeric, confirmed_paid_amount numeric, outstanding_amount numeric, is_overdue boolean, receipt_id uuid, receipt_amount numeric, receipt_status text, receipt_payment_date date, receipt_tracking_number text, receipt_bank_name text)
--    LANGUAGE plpgsql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   BEGIN
--     IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
--       RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
--     END IF;
--   
--     IF p_customer_id IS NULL AND p_invoice_id IS NULL THEN
--       RAISE EXCEPTION 'p_customer_id or p_invoice_id required' USING ERRCODE = '22023';
--     END IF;
--   
--     RETURN QUERY
--     SELECT
--       v.customer_id, v.customer_name, COALESCE(c.phone, q.customer_phone) AS customer_phone,
--       v.invoice_id, v.invoice_number, v.invoice_type, v.invoice_status,
--       -- a quote has no issue_date; the receivable row's created_at is the date it
--       -- became a commitment
--       v.created_at::date AS issue_date,
--       v.due_date,
--       v.total_amount, v.deposit_amount, v.confirmed_paid_amount,
--       v.outstanding_amount, v.is_overdue,
--       pr.id AS receipt_id, prl.amount AS receipt_amount, pr.status AS receipt_status,
--       pr.payment_date AS receipt_payment_date,
--       pr.tracking_number AS receipt_tracking_number,
--       pr.bank_name AS receipt_bank_name
--     FROM public.vw_customer_receivables v
--     -- 331: LEFT JOIN to the invoice table removed — it never matched a row and its only
--     -- consumed column (issue_date) is resolved above. The quote join below is the live one.
--     LEFT JOIN public.sales_quotes q      ON q.id = v.invoice_id
--     LEFT JOIN public.customers c         ON c.id = v.customer_id
--     -- v.invoice_id carries an invoice id or a quote id; the two id spaces are
--     -- disjoint, and the migration-148 CHECK guarantees a link row sets exactly one
--     LEFT JOIN public.payment_receipt_links prl
--            ON (prl.invoice_id = v.invoice_id OR prl.quote_id = v.invoice_id)
--     LEFT JOIN public.payment_receipts    pr   ON pr.id = prl.receipt_id
--     WHERE (p_invoice_id  IS NULL OR v.invoice_id  = p_invoice_id)
--       AND (p_customer_id IS NULL OR v.customer_id = p_customer_id)
--     ORDER BY v.due_date NULLS LAST, pr.payment_date NULLS LAST;
--   END;
--   $function$
--   
-- =====================================================================================

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
        CASE
            WHEN src.due_date IS NOT NULL THEN src.due_date - tehran_today()
            ELSE NULL::integer
        END AS days_until_due,
    src.due_date IS NOT NULL AND src.due_date < tehran_today() AND src.outstanding_amount > 0::numeric AS is_overdue,
    src.created_at,
        CASE
            WHEN src.due_date IS NULL THEN 'current'::text
            WHEN (tehran_today() - src.due_date) <= 0 THEN 'current'::text
            WHEN (tehran_today() - src.due_date) <= 30 THEN 'd1_30'::text
            WHEN (tehran_today() - src.due_date) <= 60 THEN 'd31_60'::text
            WHEN (tehran_today() - src.due_date) <= 90 THEN 'd61_90'::text
            ELSE 'd90_plus'::text
        END AS aging_bucket,
    src.settlement_title,
    src.settlement_days,
    src.settlement_is_active,
    src.due_date IS NULL AS due_date_unknown,
    src.due_date_unknown_reason,
    src.settlement_inactive_flag
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
                CASE
                    WHEN q.accepted_at IS NULL THEN NULL::date
                    WHEN st.id IS NULL THEN NULL::date
                    WHEN st.is_active = false AND st.days = 0 THEN NULL::date
                    ELSE (q.accepted_at + ((st.days || ' days'::text)::interval))::date
                END AS due_date,
            q.final_amount::numeric(18,2) AS total_amount,
            0::numeric AS deposit_amount,
            COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
            GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
            true AS commitment_confirmed,
            q.created_at,
            st.title AS settlement_title,
            st.days AS settlement_days,
            st.is_active AS settlement_is_active,
                CASE
                    WHEN q.accepted_at IS NULL THEN 'no_accepted_at'::text
                    WHEN st.id IS NULL THEN 'no_settlement_type'::text
                    WHEN st.is_active = false AND st.days = 0 THEN 'inactive_zero_days'::text
                    ELSE NULL::text
                END AS due_date_unknown_reason,
            st.id IS NOT NULL AND st.is_active = false AND st.days > 0 AS settlement_inactive_flag
           FROM sales_quotes q
             LEFT JOIN customers c ON c.id = q.customer_id
             LEFT JOIN paid_quote p ON p.doc_id = q.id
             LEFT JOIN settlement_types st ON st.id = q.settlement_type_id
          WHERE q.status = 'accepted'::sales_quote_status AND GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric) src
  WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid());

-- -------------------------------------------------------------------------------------
-- get_receivables_list: same body, four new columns carried through to the page.
-- -------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_receivables_list(date, date, uuid, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_receivables_list(
  p_from_date date DEFAULT NULL::date,
  p_to_date date DEFAULT NULL::date,
  p_customer_id uuid DEFAULT NULL::uuid,
  p_due_filter text DEFAULT 'all'::text,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0)
 RETURNS TABLE(customer_id uuid, customer_name text, invoice_id uuid, invoice_number text,
               invoice_type text, invoice_status text, due_date date, total_amount numeric,
               deposit_amount numeric, confirmed_paid_amount numeric, outstanding_amount numeric,
               days_until_due integer, is_overdue boolean, created_at timestamp with time zone,
               aging_bucket text,
               settlement_title text, settlement_days integer,
               due_date_unknown boolean, due_date_unknown_reason text,
               settlement_inactive_flag boolean)
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
    v.days_until_due, v.is_overdue, v.created_at, v.aging_bucket,
    v.settlement_title, v.settlement_days,
    v.due_date_unknown, v.due_date_unknown_reason, v.settlement_inactive_flag
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

-- -------------------------------------------------------------------------------------
-- get_receivable_detail: same body and same joins, carrying the two markers so the
-- drill-down can explain a due date the list called unknown.
-- -------------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_receivable_detail(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_receivable_detail(
  p_customer_id uuid DEFAULT NULL::uuid,
  p_invoice_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(customer_id uuid, customer_name text, customer_phone text, invoice_id uuid,
               invoice_number text, invoice_type text, invoice_status text, issue_date date,
               due_date date, total_amount numeric, deposit_amount numeric,
               confirmed_paid_amount numeric, outstanding_amount numeric, is_overdue boolean,
               receipt_id uuid, receipt_amount numeric, receipt_status text,
               receipt_payment_date date, receipt_tracking_number text, receipt_bank_name text,
               settlement_title text, settlement_days integer,
               due_date_unknown boolean, due_date_unknown_reason text,
               settlement_inactive_flag boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::app_role[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_customer_id IS NULL AND p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'p_customer_id or p_invoice_id required' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    v.customer_id, v.customer_name, COALESCE(c.phone, q.customer_phone) AS customer_phone,
    v.invoice_id, v.invoice_number, v.invoice_type, v.invoice_status,
    -- a quote has no issue_date; the receivable row's created_at is the date it
    -- became a commitment
    v.created_at::date AS issue_date,
    v.due_date,
    v.total_amount, v.deposit_amount, v.confirmed_paid_amount,
    v.outstanding_amount, v.is_overdue,
    pr.id AS receipt_id, prl.amount AS receipt_amount, pr.status AS receipt_status,
    pr.payment_date AS receipt_payment_date,
    pr.tracking_number AS receipt_tracking_number,
    pr.bank_name AS receipt_bank_name,
    v.settlement_title, v.settlement_days,
    v.due_date_unknown, v.due_date_unknown_reason, v.settlement_inactive_flag
  FROM public.vw_customer_receivables v
  -- 331: LEFT JOIN to the invoice table removed — it never matched a row and its only
  -- consumed column (issue_date) is resolved above. The quote join below is the live one.
  LEFT JOIN public.sales_quotes q      ON q.id = v.invoice_id
  LEFT JOIN public.customers c         ON c.id = v.customer_id
  -- v.invoice_id carries an invoice id or a quote id; the two id spaces are
  -- disjoint, and the migration-148 CHECK guarantees a link row sets exactly one
  LEFT JOIN public.payment_receipt_links prl
         ON (prl.invoice_id = v.invoice_id OR prl.quote_id = v.invoice_id)
  LEFT JOIN public.payment_receipts    pr   ON pr.id = prl.receipt_id
  WHERE (p_invoice_id  IS NULL OR v.invoice_id  = p_invoice_id)
    AND (p_customer_id IS NULL OR v.customer_id = p_customer_id)
  ORDER BY v.due_date NULLS LAST, pr.payment_date NULLS LAST;
END;
$function$;

DO $v$
DECLARE _n int; _def text;
BEGIN
  -- the view must carry the new columns
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='vw_customer_receivables'
     AND column_name IN ('settlement_title','settlement_days','settlement_is_active',
                         'due_date_unknown','due_date_unknown_reason','settlement_inactive_flag');
  IF _n <> 6 THEN RAISE EXCEPTION '419: view is missing the new columns (found %)', _n; END IF;

  -- expires_at must be gone from the due-date logic entirely
  SELECT pg_get_viewdef('public.vw_customer_receivables'::regclass, true) INTO _def;
  IF _def LIKE '%expires_at%' THEN
    RAISE EXCEPTION '419: the view still references expires_at';
  END IF;
  IF _def NOT LIKE '%accepted_at%' OR _def NOT LIKE '%settlement_types%' THEN
    RAISE EXCEPTION '419: the view does not derive the due date from accepted_at + settlement days';
  END IF;
  -- the anon guard the view already had must survive the rewrite
  IF _def NOT LIKE '%uid() IS NOT NULL%' OR _def NOT LIKE '%is_viewer_only%' THEN
    RAISE EXCEPTION '419: the rewrite dropped the view''s own uid guard';
  END IF;

  -- both rebuilt functions must exist exactly once (no accidental overload)
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_receivables_list';
  IF _n <> 1 THEN RAISE EXCEPTION '419: get_receivables_list exists % times', _n; END IF;
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_receivable_detail';
  IF _n <> 1 THEN RAISE EXCEPTION '419: get_receivable_detail exists % times', _n; END IF;

  -- the summary function must NOT have been touched
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_receivables_summary';
  IF _n <> 1 THEN RAISE EXCEPTION '419: get_receivables_summary was disturbed'; END IF;
END
$v$;
