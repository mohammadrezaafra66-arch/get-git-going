SET client_encoding='UTF8';

-- 458. A receivable with no due date stops falling out of the summary.
--
-- WHAT WAS ACTUALLY WRONG, AND WHAT WAS NOT. This row was handed over as
-- "total_outstanding = 1,679,300,000 against a bucket sum of 1,616,300,000 -- a
-- 63,000,000 gap". Measured under an admin JWT on the test database, that is not
-- what happens:
--
--   total_outstanding 1,679,300,000
--   bucket_current       63,000,000   bucket_d1_30   1,053,600,000
--   bucket_d31_60       562,700,000   bucket_d61_90              0
--   bucket_d90_plus               0
--   -------------------------------------------------------------
--   bucket sum        1,679,300,000   gap  0
--
-- The buckets DO add up. `vw_customer_receivables` files a NULL due date under
-- 'current' (WHEN src.due_date IS NULL THEN 'current'), so no row is bucketless.
-- 1,616,300,000 is not a bucket sum: it is the total once ANY date filter is
-- applied. That is the real defect, and it is worse than the one reported.
--
--   get_receivables_summary()                          -> 1,679,300,000, 8 items
--   get_receivables_summary('1900-01-01','2999-12-31') -> 1,616,300,000, 7 items
--
-- A range spanning eleven centuries loses 63,000,000 toman. The cause is that
-- `due_date >= p_from_date` is NULL, not true, when the row has no due date, so
-- the row is dropped -- silently, with no indication on the screen that anything
-- was removed. The accountant reads a smaller total and has no way to tell.
--
-- THE ROW. SQ-2026-000005, 63,000,000, due_date NULL, due_date_unknown = true,
-- due_date_unknown_reason = 'inactive_zero_days'. Migration 419 created it
-- deliberately: a settlement type that is inactive AND has days = 0 means nobody
-- ever set it, so 419 refused to invent a due date, and named the condition
-- rather than hiding it. 419 states plainly that it did NOT touch
-- get_receivables_summary -- which is exactly where the consequence landed.
--
-- THE DECISION, following 419's own concept rather than inventing a shape:
--
--   1. A row with no due date is never removed by a due-date range. There is no
--      date to compare it against, so a range cannot honestly exclude it, and
--      excluding it deletes real money from a total. The predicate becomes
--      `(p_from_date IS NULL OR v.due_date >= p_from_date OR v.due_date_unknown)`,
--      using the view's own `due_date_unknown` flag (419) rather than a fresh
--      NULL test.
--
--   2. The amount is NAMED, not merely included. Two columns are appended:
--      `due_date_unknown_outstanding` and `count_due_date_unknown`, so the
--      accountant can see how much of the total has no due date instead of it
--      hiding inside bucket_current.
--
--   3. The bucketing is NOT changed. 419 rebuilt the view with NULL due dates
--      filed under 'current' and left it that way; moving 63,000,000 out of
--      bucket_current would change a number nobody asked about. The two new
--      columns are an OVERLAPPING breakdown of the total, not a sixth bucket --
--      exactly as overdue_outstanding / due_today / due_tomorrow already overlap
--      the buckets in this same function. Do not add them to the bucket row.
--
-- WHAT MOVES. With no date filter: nothing at all (total, items and every bucket
-- are unchanged; the two new columns report 63,000,000 / 1). With a date filter:
-- the unknown-due-date row is retained instead of dropped, so on today's data a
-- filtered total goes 1,616,300,000 -> 1,679,300,000 and items_count 7 -> 8.
-- That single row is the defect being fixed; no other row moves in either case.
--
-- WHY DROP AND RECREATE. RETURNS TABLE enumerates the output columns and
-- CREATE OR REPLACE cannot change a return type. The previous definition is
-- preserved verbatim below, as pg_get_functiondef printed it, so the previous
-- state is recoverable by hand. Grants are restored to exactly what was
-- measured before the drop (anon/authenticated/service_role/postgres EXECUTE,
-- plus the implicit PUBLIC EXECUTE a fresh function receives) so this migration
-- does not move the security posture; the function guards itself with
-- has_any_role and raises 42501 otherwise, unchanged.
--
-- PostgREST caches RPC signatures at startup, so afrakala-lan-rest must be
-- restarted after this.
--
-- DATA IMPACT: none. No table is written; this is a read-only reporting function.

-- =====================================================================================
-- RECOVERY BLOCK -- get_receivables_summary as pg_get_functiondef printed it before 458
-- =====================================================================================
-- CREATE OR REPLACE FUNCTION public.get_receivables_summary(p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_customer_id uuid DEFAULT NULL::uuid)
--  RETURNS TABLE(total_outstanding numeric, overdue_outstanding numeric, due_today numeric, due_tomorrow numeric, future_outstanding numeric, items_count bigint, bucket_current numeric, bucket_d1_30 numeric, bucket_d31_60 numeric, bucket_d61_90 numeric, bucket_d90_plus numeric, count_current bigint, count_d1_30 bigint, count_d31_60 bigint, count_d61_90 bigint, count_d90_plus bigint)
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- BEGIN
--   IF NOT public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]) THEN
--     RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
--   END IF;
--
--   RETURN QUERY
--   SELECT
--     COALESCE(SUM(v.outstanding_amount), 0)::numeric                                              AS total_outstanding,
--     COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.is_overdue), 0)::numeric                  AS overdue_outstanding,
--     COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = public.tehran_today()), 0)::numeric     AS due_today,
--     COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date = public.tehran_today() + 1), 0)::numeric AS due_tomorrow,
--     COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date > public.tehran_today() + 1), 0)::numeric AS future_outstanding,
--     COUNT(*)::bigint                                                                             AS items_count,
--     COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'current'), 0)::numeric    AS bucket_current,
--     COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'd1_30'), 0)::numeric      AS bucket_d1_30,
--     COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'd31_60'), 0)::numeric     AS bucket_d31_60,
--     COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'd61_90'), 0)::numeric     AS bucket_d61_90,
--     COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.aging_bucket = 'd90_plus'), 0)::numeric   AS bucket_d90_plus,
--     COUNT(*) FILTER (WHERE v.aging_bucket = 'current')::bigint                                   AS count_current,
--     COUNT(*) FILTER (WHERE v.aging_bucket = 'd1_30')::bigint                                     AS count_d1_30,
--     COUNT(*) FILTER (WHERE v.aging_bucket = 'd31_60')::bigint                                    AS count_d31_60,
--     COUNT(*) FILTER (WHERE v.aging_bucket = 'd61_90')::bigint                                    AS count_d61_90,
--     COUNT(*) FILTER (WHERE v.aging_bucket = 'd90_plus')::bigint                                  AS count_d90_plus
--   FROM public.vw_customer_receivables v
--   WHERE (p_customer_id IS NULL OR v.customer_id = p_customer_id)
--     AND (p_from_date   IS NULL OR v.due_date   >= p_from_date)
--     AND (p_to_date     IS NULL OR v.due_date   <= p_to_date);
-- END;
-- $function$

DROP FUNCTION IF EXISTS public.get_receivables_summary(date, date, uuid);

CREATE FUNCTION public.get_receivables_summary(
  p_from_date   date DEFAULT NULL::date,
  p_to_date     date DEFAULT NULL::date,
  p_customer_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  total_outstanding numeric, overdue_outstanding numeric, due_today numeric,
  due_tomorrow numeric, future_outstanding numeric, items_count bigint,
  bucket_current numeric, bucket_d1_30 numeric, bucket_d31_60 numeric,
  bucket_d61_90 numeric, bucket_d90_plus numeric,
  count_current bigint, count_d1_30 bigint, count_d31_60 bigint,
  count_d61_90 bigint, count_d90_plus bigint,
  due_date_unknown_outstanding numeric, count_due_date_unknown bigint
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
    COUNT(*) FILTER (WHERE v.aging_bucket = 'd90_plus')::bigint                                  AS count_d90_plus,
    -- An overlapping breakdown of total_outstanding, NOT a sixth bucket (458).
    COALESCE(SUM(v.outstanding_amount) FILTER (WHERE v.due_date_unknown), 0)::numeric            AS due_date_unknown_outstanding,
    COUNT(*) FILTER (WHERE v.due_date_unknown)::bigint                                           AS count_due_date_unknown
  FROM public.vw_customer_receivables v
  WHERE (p_customer_id IS NULL OR v.customer_id = p_customer_id)
    -- A row with no due date has no date to compare, so a due-date range cannot
    -- honestly exclude it. Dropping it deleted real money from the total (458).
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date OR v.due_date_unknown)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date   OR v.due_date_unknown);
END;
$function$;

COMMENT ON FUNCTION public.get_receivables_summary(date, date, uuid) IS
  'Receivables aging summary. Rows with no due date (due_date_unknown, see 419) are never removed by the date range and are reported separately in due_date_unknown_outstanding / count_due_date_unknown, which OVERLAP the buckets rather than adding to them (458).';

GRANT EXECUTE ON FUNCTION public.get_receivables_summary(date, date, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_receivables_summary(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_receivables_summary(date, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_receivables_summary(date, date, uuid) TO postgres;
