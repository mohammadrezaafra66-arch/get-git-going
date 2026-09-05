SET client_encoding='UTF8';

-- =====================================================================================
-- 466 (W-2): the receivables report carries the salesperson and the credit ceiling.
-- =====================================================================================
--
-- WHAT THE ACCOUNTANT COULD NOT SEE. /accounting/receivables lists every accepted quote
-- with money still outstanding, and answered neither "who sold this" nor "how much credit
-- is this customer allowed". vw_customer_receivables carries neither column.
--
-- WHY THIS IS A FUNCTION CHANGE AND NOT A VIEW CHANGE. The page reads
-- get_receivables_list, which enumerates its columns in RETURNS TABLE; a column added to
-- the view alone would be stranded in the database (the same reasoning migration 419
-- wrote down for the due-date flags). The view is deliberately left untouched: it is also
-- read by get_receivables_summary and by compute_daily_capital, and neither of them wants
-- these two columns. The joins therefore live in the function.
--
-- WHY THE FUNCTION IS DROPPED AND REBUILT RATHER THAN REPLACED. CREATE OR REPLACE cannot
-- change a return type. The previous definition is preserved verbatim in the RECOVERY
-- BLOCK below, exactly as pg_get_functiondef printed it before 466, so the previous state
-- is recoverable by hand. Verified before writing this file: the live definition and the
-- one in 20260831210000_419_receivables_due_date_from_settlement_terms.sql are identical
-- apart from line wrapping. No drift.
--
-- ----------------------------------------------------------------------------------
-- SALESPERSON: WHICH OF THE TWO. Measured live on 2026-09-06, there are two different
-- columns in this database both called salesperson_id, and they do NOT agree:
--
--   sales_quotes.salesperson_id                        -- who wrote this quote
--   customer_capital_allocations_dynamic.salesperson_id -- customers.responsible_id,
--                                                          copied at snapshot time
--
-- On all 8 rows of the latest snapshot (2026-08-31) the allocation column is byte-for-byte
-- customers.responsible_id. On the receivables rows the two sources disagree: customer
-- 21746e0a (a test customer) is responsible_id 00ebe9d3 but every one of its three outstanding
-- quotes was written by b51e3d4f.
--
-- This report is per invoice, so the honest answer to "who sold this invoice" is the
-- quote's own salesperson_id. It is also the only one that is complete: 66 of 66
-- sales_quotes carry it (all 9 accepted ones included), while the allocation column
-- reaches only 2 of the 5 customers that currently appear on this report.
--
-- ----------------------------------------------------------------------------------
-- CEILING: NULL IS NOT ZERO. credit_ceiling is customer_capital_allocations_dynamic
-- .final_limit for the MOST RECENT daily_capital_settings row, and it is left NULL --
-- never COALESCEd to 0 -- when the customer has no allocation in that snapshot, or has no
-- customer_id at all (a guest quote). A customer whose ceiling was computed as zero and a
-- customer whose ceiling was never computed are different facts, and printing 0 for the
-- second is the defect migration 453 already fixed once on the credit-customers report.
-- The caller renders NULL as the Persian phrase for an unregistered ceiling.
--
-- Only the latest snapshot is consulted. An older snapshot's number is not this
-- customer's current ceiling, so credit_ceiling_date is returned alongside it and the
-- page shows it: a ceiling dated 2026-08-31 read on 2026-09-06 must say so.
--
-- This reads the allocation snapshot; it does not revive the retired capital-allocation
-- cycle (owner decision D-13). No hold/consume/release/refund function is referenced.
--
-- profiles is readable only by an admin or by its owner under RLS, so the salesperson's
-- name could not be resolved client-side by an accountant. This function is SECURITY
-- DEFINER and already gates on admin/manager/accountant, so it resolves the name itself.
--
-- Grants after the rebuild must be authenticated only. Measured before the drop:
--   {postgres=X/supabase_admin,supabase_admin=X/supabase_admin,
--    authenticated=X/supabase_admin,service_role=X/supabase_admin}
-- anon was NOT present and must not become present. CREATE restores the PUBLIC default,
-- so the REVOKEs below are part of the same transaction.
--
-- PostgREST caches RPC signatures at startup: restart afrakala-lan-rest after this.

-- =====================================================================================
-- RECOVERY BLOCK -- get_receivables_list, as pg_get_functiondef printed it before 466
-- =====================================================================================
-- CREATE OR REPLACE FUNCTION public.get_receivables_list(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_customer_id uuid DEFAULT NULL::uuid, p_due_filter text DEFAULT 'all'::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
--  RETURNS TABLE(customer_id uuid, customer_name text, invoice_id uuid, invoice_number text, invoice_type text, invoice_status text, due_date date, total_amount numeric, deposit_amount numeric, confirmed_paid_amount numeric, outstanding_amount numeric, days_until_due integer, is_overdue boolean, created_at timestamp with time zone, aging_bucket text, settlement_title text, settlement_days integer, due_date_unknown boolean, due_date_unknown_reason text, settlement_inactive_flag boolean)
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
--   v_offset int  := GREATEST(COALESCE(p_offset, 0), 0);
--   v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
--   v_filter text := COALESCE(p_due_filter, 'all');
-- BEGIN
--   IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
--     RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
--   END IF;
--
--   IF v_filter NOT IN ('all','overdue','today','tomorrow','future',
--                       'current','d1_30','d31_60','d61_90','d90_plus') THEN
--     RAISE EXCEPTION 'invalid due filter: %', v_filter USING ERRCODE = '22023';
--   END IF;
--
--   RETURN QUERY
--   SELECT
--     v.customer_id, v.customer_name, v.invoice_id, v.invoice_number,
--     v.invoice_type, v.invoice_status, v.due_date, v.total_amount,
--     v.deposit_amount, v.confirmed_paid_amount, v.outstanding_amount,
--     v.days_until_due, v.is_overdue, v.created_at, v.aging_bucket,
--     v.settlement_title, v.settlement_days,
--     v.due_date_unknown, v.due_date_unknown_reason, v.settlement_inactive_flag
--   FROM public.vw_customer_receivables v
--   WHERE (p_customer_id IS NULL OR v.customer_id = p_customer_id)
--     AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
--     AND (p_to_date     IS NULL OR v.due_date   <= p_to_date)
--     AND (
--       v_filter = 'all'
--       OR (v_filter = 'overdue'  AND v.is_overdue)
--       OR (v_filter = 'today'    AND v.due_date = public.tehran_today())
--       OR (v_filter = 'tomorrow' AND v.due_date = public.tehran_today() + 1)
--       OR (v_filter = 'future'   AND v.due_date > public.tehran_today() + 1)
--       OR (v_filter IN ('current','d1_30','d31_60','d61_90','d90_plus')
--           AND v.aging_bucket = v_filter)
--     )
--     AND (
--       v_search IS NULL
--       OR v.customer_name  ILIKE '%'||v_search||'%'
--       OR v.invoice_number ILIKE '%'||v_search||'%'
--     )
--   ORDER BY v.is_overdue DESC, v.due_date NULLS LAST, v.outstanding_amount DESC
--   LIMIT v_limit OFFSET v_offset;
-- END;
-- $function$
-- =====================================================================================

BEGIN;

DROP FUNCTION public.get_receivables_list(date, date, uuid, text, text, integer, integer);

CREATE FUNCTION public.get_receivables_list(
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
               settlement_inactive_flag boolean,
               salesperson_id uuid, salesperson_name text,
               credit_ceiling numeric, credit_ceiling_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_limit  int  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int  := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_filter text := COALESCE(p_due_filter, 'all');
  v_setting_id   uuid;
  v_setting_date date;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_filter NOT IN ('all','overdue','today','tomorrow','future',
                      'current','d1_30','d31_60','d61_90','d90_plus') THEN
    RAISE EXCEPTION 'invalid due filter: %', v_filter USING ERRCODE = '22023';
  END IF;

  -- The ceiling is only ever read from the newest capital snapshot. If none has ever been
  -- run, both stay NULL and every row reports an unregistered ceiling, which is true.
  SELECT s.id, s.capital_date INTO v_setting_id, v_setting_date
  FROM public.daily_capital_settings s
  ORDER BY s.capital_date DESC, s.created_at DESC
  LIMIT 1;

  RETURN QUERY
  SELECT
    v.customer_id, v.customer_name, v.invoice_id, v.invoice_number,
    v.invoice_type, v.invoice_status, v.due_date, v.total_amount,
    v.deposit_amount, v.confirmed_paid_amount, v.outstanding_amount,
    v.days_until_due, v.is_overdue, v.created_at, v.aging_bucket,
    v.settlement_title, v.settlement_days,
    v.due_date_unknown, v.due_date_unknown_reason, v.settlement_inactive_flag,
    q.salesperson_id,
    pr.full_name AS salesperson_name,
    -- No COALESCE. A ceiling that was never computed stays NULL and is rendered as
    -- the Persian phrase for an unregistered ceiling; a ceiling computed as zero stays 0
    -- and is rendered as a number.
    cap.final_limit AS credit_ceiling,
    CASE WHEN cap.final_limit IS NULL THEN NULL ELSE v_setting_date END AS credit_ceiling_date
  FROM public.vw_customer_receivables v
  LEFT JOIN public.sales_quotes q ON q.id = v.invoice_id
  LEFT JOIN public.profiles    pr ON pr.id = q.salesperson_id
  LEFT JOIN public.customer_capital_allocations_dynamic cap
         ON v_setting_id IS NOT NULL
        AND v.customer_id IS NOT NULL
        AND cap.capital_setting_id = v_setting_id
        AND cap.customer_id        = v.customer_id
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

-- CREATE restores the default PUBLIC grant. Put the pre-466 grant set back exactly.
REVOKE EXECUTE ON FUNCTION public.get_receivables_list(date, date, uuid, text, text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_receivables_list(date, date, uuid, text, text, integer, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_receivables_list(date, date, uuid, text, text, integer, integer) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_receivables_list(date, date, uuid, text, text, integer, integer) TO service_role;

DO $verify$
DECLARE
  v_oid oid;
  n int;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'get_receivables_list';
  IF v_oid IS NULL THEN RAISE EXCEPTION '466: get_receivables_list is missing'; END IF;

  -- exactly one overload survives the drop/create
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'get_receivables_list';
  IF n <> 1 THEN RAISE EXCEPTION '466: expected 1 get_receivables_list, found %', n; END IF;

  -- the four new columns are actually in the signature
  IF pg_get_function_result(v_oid) NOT LIKE '%salesperson_id uuid%'
     OR pg_get_function_result(v_oid) NOT LIKE '%salesperson_name text%'
     OR pg_get_function_result(v_oid) NOT LIKE '%credit_ceiling numeric%'
     OR pg_get_function_result(v_oid) NOT LIKE '%credit_ceiling_date date%' THEN
    RAISE EXCEPTION '466: new columns missing from the return type: %', pg_get_function_result(v_oid);
  END IF;

  -- the grant set is exactly what it was before 466
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION '466: anon must not be able to execute get_receivables_list';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION '466: authenticated lost EXECUTE on get_receivables_list';
  END IF;

  -- the gate still refuses a caller with no role
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
  BEGIN
    PERFORM 1 FROM public.get_receivables_list(NULL, NULL, NULL, 'all', NULL, 1, 0);
    RAISE EXCEPTION '466: a roleless caller reached get_receivables_list';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- 42501, the gate fired: expected
  END;
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $verify$;

COMMIT;
