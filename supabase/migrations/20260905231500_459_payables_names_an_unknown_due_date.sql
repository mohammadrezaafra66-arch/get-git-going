SET client_encoding='UTF8';

-- 459. The payables view names an unknown due date instead of inventing one,
--      and flags a payment term that is no longer on offer.
--
-- THE HANDOVER SAID: "payment_terms.days is nullable with
-- CHECK (days IS NULL OR days >= 0), and create_purchase checks only existence
-- and is_active. A null days yields due_date = purchase_date. Two routes in,
-- close BOTH: (a) deleting a term through PostgREST -- ON DELETE SET NULL,
-- (b) creating an active term with an empty days."
--
-- NONE OF THAT IS TRUE OF THIS DATABASE ANY MORE. Migration 423 closed both
-- routes on 2026-09-04, by name, one day before this row was written. Measured
-- live 2026-09-05:
--
--   payment_terms.days        attnotnull = t          (NOT nullable)
--   payment_terms_days_check  CHECK (days >= 0)       (not the nullable form)
--   purchases_payment_term_id_fkey  ... ON DELETE RESTRICT   (not SET NULL)
--   purchases.payment_term_id attnotnull = t
--   purchases with payment_term_id IS NULL: 0 of 317
--
-- Each route was probed under the `authenticated` role with an admin JWT --
-- exactly what PostgREST executes -- inside BEGIN ... ROLLBACK:
--
--   (a) DELETE FROM payment_terms WHERE id = <"cash", used by 300 purchases>
--       -> ERROR 23503, violates foreign key constraint
--          purchases_payment_term_id_fkey. (Before 423, ON DELETE SET NULL
--          would have stripped the term from all 300 in one statement.)
--   (b) INSERT INTO payment_terms (name, days, is_active)
--            VALUES ('probe-459-null-days', NULL, true)
--       -> ERROR 23502, null value in column "days" violates not-null constraint
--   (b2) UPDATE payment_terms SET days = NULL      -> ERROR 23502, same
--   (c) UPDATE purchases SET payment_term_id = NULL -> ERROR 23502,
--          null value in column "payment_term_id" violates not-null constraint
--
-- So there is no route by which pt.days can be NULL, and the "overdue the next
-- day" symptom is unreachable. Nothing here re-closes an open door.
--
-- WHAT IS STILL GENUINELY WRONG, AND IS WHAT THIS MIGRATION FIXES. The view
-- still ENCODES the old wrong behaviour:
--     CASE WHEN pt.days IS NOT NULL THEN (purchase_date + pt.days) ELSE purchase_date END
-- The ELSE arm is unreachable today only because of 423's constraints. If it
-- were ever reached it would silently report the purchase date as the due date,
-- and the row would read "overdue" from the day after the purchase -- a wrong
-- number wearing a reassuring label. That is precisely what migration 419
-- removed from the receivables side, whose rule this migration now mirrors:
-- "Nothing here ever substitutes today or created_at for a date it does not
-- know." The view is made to say "unknown" instead, so the trap cannot spring
-- if a future migration relaxes a constraint.
--
-- THE ASYMMETRY THE HANDOVER ASKED ABOUT. Receivables carries due_date_unknown,
-- due_date_unknown_reason and settlement_inactive_flag; payables carried none.
-- This adds the three matching columns.
--
-- ONE DELIBERATE DIFFERENCE FROM 419 -- PLEASE DO NOT "CORRECT" IT LATER.
-- 419 treats an INACTIVE settlement type with days = 0 as "no due date", on the
-- reasoning that a 0 on a type nobody maintains means nobody ever set it. That
-- reasoning does NOT transfer to purchases. Here days = 0 is the "cash" term,
-- it is active, and 300 of 317 purchases use it (423: "days = 0 on an active
-- type is a real business value"). Mirroring 419's rule would mean that
-- deactivating the cash term someday would blank the due date on three hundred
-- real purchases in one toggle. So payables treats ONLY a missing term row as
-- unknown, and reports an inactive term through the informational
-- payment_term_inactive_flag, which changes no date and no amount.
--
-- WHAT MOVES: nothing. pt.days is never NULL and pt is never missing, so all 17
-- pre-existing columns are byte-identical on all 317 rows (proved by EXCEPT in
-- both directions); the three new columns read false / NULL / false throughout.
-- This is defence in depth, not a correction of a live number.
--
-- get_payables_summary gets the same date-range hardening 458 gave the
-- receivables side, so payables cannot develop the leak 458 just closed. Its
-- signature is unchanged, so CREATE OR REPLACE suffices and no grant is
-- disturbed. Its return columns are deliberately NOT extended with the
-- unknown-amount pair: that would be signature churn on a money RPC for a
-- figure that is provably zero here. Noted as a follow-up, not done silently.
--
-- DATA IMPACT: none. Views and one read-only reporting function; no row written.

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
     src.aging_bucket,
     src.due_date_unknown,
     src.due_date_unknown_reason,
     src.payment_term_inactive_flag
    FROM ( SELECT p.supplier_id,
             s.name AS supplier_name,
             p.id AS purchase_id,
             p.purchase_date,
             pt.days AS payment_term_days,
                 CASE
                     WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date
                     ELSE NULL::date
                 END AS due_date,
             p.total_amount AS purchase_total_amount,
             p.cash_price,
             p.currency,
             p.paid_at,
             p.paid_at IS NOT NULL AS is_paid,
                 CASE
                     WHEN p.paid_at IS NOT NULL THEN 0::numeric
                     ELSE COALESCE(p.total_amount, 0::numeric)
                 END AS outstanding_amount,
                 CASE
                     WHEN p.paid_at IS NOT NULL THEN NULL::integer
                     WHEN pt.days IS NOT NULL THEN (p.purchase_date + ((pt.days || ' days'::text)::interval))::date - tehran_today()
                     ELSE NULL::integer
                 END AS days_until_due,
             p.paid_at IS NULL AND pt.days IS NOT NULL AND
                 (p.purchase_date + ((pt.days || ' days'::text)::interval))::date < tehran_today() AS is_overdue,
             NULL::text AS product_summary,
             p.created_at,
                 CASE
                     WHEN p.paid_at IS NOT NULL THEN 'current'::text
                     WHEN pt.days IS NULL THEN 'current'::text
                     WHEN (tehran_today() - (p.purchase_date + ((pt.days || ' days'::text)::interval))::date) <= 0 THEN 'current'::text
                     WHEN (tehran_today() - (p.purchase_date + ((pt.days || ' days'::text)::interval))::date) <= 30 THEN 'd1_30'::text
                     WHEN (tehran_today() - (p.purchase_date + ((pt.days || ' days'::text)::interval))::date) <= 60 THEN 'd31_60'::text
                     WHEN (tehran_today() - (p.purchase_date + ((pt.days || ' days'::text)::interval))::date) <= 90 THEN 'd61_90'::text
                     ELSE 'd90_plus'::text
                 END AS aging_bucket,
             pt.days IS NULL AS due_date_unknown,
                 CASE
                     WHEN pt.id IS NULL THEN 'no_payment_term'::text
                     WHEN pt.days IS NULL THEN 'no_term_days'::text
                     ELSE NULL::text
                 END AS due_date_unknown_reason,
             pt.id IS NOT NULL AND pt.is_active = false AS payment_term_inactive_flag
            FROM purchases p
              LEFT JOIN suppliers s ON s.id = p.supplier_id
              LEFT JOIN payment_terms pt ON pt.id = p.payment_term_id) src
   WHERE auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid());

COMMENT ON VIEW public.vw_supplier_payables IS
  'Supplier payables aging. outstanding_amount is the purchase total_amount (457): cash_price is the gamification benchmark price, not the debt. A missing payment term yields due_date NULL and due_date_unknown, never the purchase date (459). Partial purchase payments are still not modeled.';

-- The same date-range hardening 458 applied to receivables. A row with no due
-- date has no date to compare, so a due-date range must not silently drop it.
-- Provably a no-op today (0 such rows); it exists so payables cannot develop
-- the leak 458 just closed.
CREATE OR REPLACE FUNCTION public.get_payables_summary(
  p_from_date   date DEFAULT NULL::date,
  p_to_date     date DEFAULT NULL::date,
  p_supplier_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  total_outstanding numeric, overdue_outstanding numeric, due_today numeric,
  due_tomorrow numeric, future_outstanding numeric, items_count bigint,
  bucket_current numeric, bucket_d1_30 numeric, bucket_d31_60 numeric,
  bucket_d61_90 numeric, bucket_d90_plus numeric,
  count_current bigint, count_d1_30 bigint, count_d31_60 bigint,
  count_d61_90 bigint, count_d90_plus bigint
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
    COUNT(*) FILTER (WHERE v.aging_bucket = 'd90_plus')::bigint                                  AS count_d90_plus
  FROM public.vw_supplier_payables v
  WHERE v.is_paid = false
    AND (p_supplier_id IS NULL OR v.supplier_id = p_supplier_id)
    AND (p_from_date   IS NULL OR v.due_date   >= p_from_date OR v.due_date_unknown)
    AND (p_to_date     IS NULL OR v.due_date   <= p_to_date   OR v.due_date_unknown);
END;
$function$;
