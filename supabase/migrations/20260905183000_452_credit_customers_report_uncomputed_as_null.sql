SET client_encoding='UTF8';

-- 452 — /sales/credit-customers stops printing "۰" for numbers that were never computed.
--
-- ============================================================================
-- WHAT IS WRONG
-- ============================================================================
-- Four of the page's columns read `customer_credit_profile`, and that table is
-- EMPTY. Measured on the test database 2026-09-05:
--
--   customers                            91 rows
--   customer_credit_profile               0 rows      <-- every column below is a COALESCE default
--   customer_credit_balance              25 rows      <-- this one IS maintained
--   credit_score_snapshots                0 rows      <-- the recompute has never once run
--
-- Nothing populates it. `calculate_credit_score(uuid)` and its batch wrapper
-- `recompute_customer_credit_scores(int,int)` both exist and are role-gated, but
-- they have ZERO callers: no frontend call site (grep over src/), no trigger
-- (pg_trigger), and no other function (scan of pg_proc bodies). Built, never wired.
--
-- The RPC then COALESCEs the missing row to 0, so the page renders a confident
-- number where there is no number:
--
--   customer_name     status     bedehi_jari   overdue_from_receivables   score   base_limit
--   شخص آزمایشی ۲۰    overdue              0                  415800000       0            0
--   مشتری آزمایشی ۱۱  overdue              0                   62200000       0            0
--   مشتری آزمایشی ۱۷  overdue              0                  500500000       0            0
--
-- A row flagged «معوق‌دار» with 415,800,000 overdue also states «بدهی جاری: ۰».
-- The two numbers contradict each other in the same row, and a salesperson reads
-- «امتیاز ۰» as a computed bad score rather than as "never calculated".
--
-- ============================================================================
-- WHAT THIS MIGRATION CHANGES — AND WHAT IT DELIBERATELY DOES NOT
-- ============================================================================
-- Changed: the four profile-fed OUTPUT columns report NULL when the customer has
-- no `customer_credit_profile` row, and a new `has_credit_profile` boolean says
-- so explicitly. The UI renders «محاسبه نشده» instead of a fabricated zero.
--
--   total_purchases, credit_score, credit_limit, outstanding_balance
--
-- NOT changed — every lending decision this page drives is byte-identical:
--   available_credit, held_credit         (from customer_credit_balance)
--   computed_allowed_credit, is_trusted   (from balance + overdue + is_active)
--   status_code, status_reason, ORDER BY, LIMIT/OFFSET, the overdue CTE
--
--   The internal arithmetic keeps its COALESCE(...,0) exactly as before, so the
--   available-credit fallback still evaluates to the same value. Only the
--   projected columns changed. GREATEST() ignores NULLs, so the fallback
--   `GREATEST(credit_limit - outstanding_balance, 0)` was already yielding 0 for
--   a missing profile and continues to.
--
-- KNOWN BEHAVIOUR CHANGE, intended: the score / purchases / outstanding filters
-- now exclude customers who have no profile, because SQL comparisons against NULL
-- are not true. Before this migration `p_max_credit_score => 50` matched all 91
-- customers on the strength of a fake 0; after it, it matches only customers who
-- actually have a score. Reporting "91 customers scored at or below 50" when none
-- of them has ever been scored is the defect, not the fix.
--
-- Retiring `customer_credit_profile`, wiring the recompute, or re-pointing the
-- page at `customer_capital_allocations_dynamic.final_limit` (the ceiling
-- migrations 411/412 recomputed under owner approval) are all OWNER DECISIONS
-- about real credit limits, and none of them is taken here.
--
-- The argument list is unchanged, so the single frontend call site and the
-- grants keep their shape; only RETURNS TABLE gains a column, which PostgreSQL
-- cannot do through CREATE OR REPLACE — hence DROP first, in this same
-- transaction, per rule 5. Grants and the comment are re-applied below because
-- DROP discards them.
--
-- Live definition was read before writing and is identical to
-- 20260720110000_credit_customers_search_by_accounting_code.sql apart from the
-- explicit ::text casts pg_get_functiondef adds (rule 4).
--
-- Rollback: docs/verification/452-down.sql

DROP FUNCTION public.list_trusted_credit_customers(
  text, text, numeric, numeric, numeric, numeric, numeric, numeric, integer, integer, boolean, integer, integer
);

CREATE FUNCTION public.list_trusted_credit_customers(
  p_search text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_min_total_purchases numeric DEFAULT NULL,
  p_max_total_purchases numeric DEFAULT NULL,
  p_min_allowed_credit numeric DEFAULT NULL,
  p_max_allowed_credit numeric DEFAULT NULL,
  p_min_outstanding_balance numeric DEFAULT NULL,
  p_max_outstanding_balance numeric DEFAULT NULL,
  p_min_credit_score integer DEFAULT NULL,
  p_max_credit_score integer DEFAULT NULL,
  p_only_trusted boolean DEFAULT false,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  customer_id uuid,
  customer_name text,
  phone text,
  easy_code text,
  responsible_id uuid,
  responsible_name text,
  total_purchases numeric,
  credit_score integer,
  credit_limit numeric,
  available_credit numeric,
  held_credit numeric,
  outstanding_balance numeric,
  computed_allowed_credit numeric,
  has_active_overdue boolean,
  overdue_amount numeric,
  overdue_count integer,
  oldest_due_date date,
  is_trusted boolean,
  status_code text,
  status_reason text,
  has_credit_profile boolean,
  total_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH authz AS (
    SELECT public.has_any_role(
      auth.uid(),
      ARRAY[
        'admin'::public.app_role,
        'manager'::public.app_role,
        'accountant'::public.app_role,
        'sales'::public.app_role,
        'viewer'::public.app_role
      ]
    ) AS allowed
  ),
  overdue AS (
    SELECT
      customer_id,
      COALESCE(SUM(outstanding_amount), 0)::numeric AS overdue_amount,
      COUNT(*)::int AS overdue_count,
      MIN(due_date)::date AS oldest_due_date
    FROM public.vw_customer_receivables
    WHERE is_overdue = true
      AND outstanding_amount > 0
    GROUP BY customer_id
  ),
  base AS (
    SELECT
      c.id AS customer_id,
      c.name AS customer_name,
      c.phone,
      c.accounting_code AS easy_code,
      c.responsible_id,
      rp.full_name AS responsible_name,
      -- 452: does a profile row exist at all? Everything below that reads ccp
      -- is meaningless without one, and the caller must be able to tell.
      (ccp.customer_id IS NOT NULL) AS has_credit_profile,
      -- 452: reported values are NULL when uncomputed...
      ccp.total_purchases::numeric AS total_purchases,
      ccp.credit_score::int        AS credit_score,
      ccp.credit_limit::numeric    AS credit_limit,
      ccp.outstanding_balance::numeric AS outstanding_balance,
      -- ...while the lending arithmetic keeps the exact COALESCE it always had,
      -- so no trust decision moves. GREATEST ignores NULLs; this still yields 0
      -- for a customer with neither a balance row nor a profile, as before.
      COALESCE(
        ccb.available_credit,
        GREATEST(COALESCE(ccp.credit_limit, 0) - COALESCE(ccp.outstanding_balance, 0), 0),
        0
      )::numeric AS available_credit,
      COALESCE(ccb.held_credit, 0)::numeric AS held_credit,
      COALESCE(o.overdue_amount, 0)::numeric AS overdue_amount,
      COALESCE(o.overdue_count, 0)::int AS overdue_count,
      o.oldest_due_date,
      COALESCE(c.is_active, true) AS customer_active
    FROM public.customers c
    LEFT JOIN public.profiles rp ON rp.id = c.responsible_id
    LEFT JOIN public.customer_credit_profile ccp ON ccp.customer_id = c.id
    LEFT JOIN public.customer_credit_balance ccb ON ccb.customer_id = c.id
    LEFT JOIN overdue o ON o.customer_id = c.id
    WHERE (SELECT allowed FROM authz) = true
  ),
  statused AS (
    SELECT
      b.*,
      CASE
        WHEN b.customer_active = false THEN 0::numeric
        WHEN b.overdue_count > 0 THEN 0::numeric
        ELSE GREATEST(COALESCE(b.available_credit, 0), 0)::numeric
      END AS computed_allowed_credit,
      CASE
        WHEN b.customer_active = false THEN false
        WHEN b.overdue_count > 0 THEN false
        WHEN GREATEST(COALESCE(b.available_credit, 0), 0) <= 0 THEN false
        ELSE true
      END AS is_trusted,
      CASE
        WHEN b.customer_active = false THEN 'inactive'
        WHEN b.overdue_count > 0 THEN 'overdue'
        WHEN GREATEST(COALESCE(b.available_credit, 0), 0) <= 0 THEN 'no_credit'
        ELSE 'trusted'
      END AS status_code,
      CASE
        WHEN b.customer_active = false THEN 'مشتری غیرفعال است.'
        WHEN b.overdue_count > 0 THEN 'دارای مانده معوق فعال است.'
        WHEN GREATEST(COALESCE(b.available_credit, 0), 0) <= 0 THEN 'سقف مجاز حساب‌باز ندارد.'
        ELSE 'مجاز برای فروش حساب‌باز تا سقف محاسبه‌شده.'
      END AS status_reason
    FROM base b
  ),
  filtered AS (
    SELECT *
    FROM statused s
    WHERE (COALESCE(NULLIF(BTRIM(p_search), ''), '') = ''
           OR s.customer_name ILIKE '%' || BTRIM(p_search) || '%'
           OR COALESCE(s.easy_code, '') ILIKE '%' || BTRIM(p_search) || '%')
      AND (COALESCE(NULLIF(BTRIM(p_phone), ''), '') = '' OR COALESCE(s.phone, '') ILIKE '%' || BTRIM(p_phone) || '%')
      AND (p_min_total_purchases IS NULL OR s.total_purchases >= p_min_total_purchases)
      AND (p_max_total_purchases IS NULL OR s.total_purchases <= p_max_total_purchases)
      AND (p_min_allowed_credit IS NULL OR s.computed_allowed_credit >= p_min_allowed_credit)
      AND (p_max_allowed_credit IS NULL OR s.computed_allowed_credit <= p_max_allowed_credit)
      AND (p_min_outstanding_balance IS NULL OR s.outstanding_balance >= p_min_outstanding_balance)
      AND (p_max_outstanding_balance IS NULL OR s.outstanding_balance <= p_max_outstanding_balance)
      AND (p_min_credit_score IS NULL OR s.credit_score >= p_min_credit_score)
      AND (p_max_credit_score IS NULL OR s.credit_score <= p_max_credit_score)
      AND (COALESCE(p_only_trusted, false) = false OR s.is_trusted = true)
  )
  SELECT
    f.customer_id,
    f.customer_name,
    f.phone,
    f.easy_code,
    f.responsible_id,
    f.responsible_name,
    f.total_purchases,
    f.credit_score,
    f.credit_limit,
    f.available_credit,
    f.held_credit,
    f.outstanding_balance,
    f.computed_allowed_credit,
    (f.overdue_count > 0) AS has_active_overdue,
    f.overdue_amount,
    f.overdue_count,
    f.oldest_due_date,
    f.is_trusted,
    f.status_code,
    f.status_reason,
    f.has_credit_profile,
    COUNT(*) OVER()::int AS total_count
  FROM filtered f
  ORDER BY f.is_trusted DESC, f.computed_allowed_credit DESC, f.customer_name ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

-- DROP discarded the grants; re-apply exactly what migrations 20260616090000 and
-- 395 established. anon and PUBLIC stay revoked.
REVOKE EXECUTE ON FUNCTION public.list_trusted_credit_customers(
  text, text, numeric, numeric, numeric, numeric, numeric, numeric, integer, integer, boolean, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_trusted_credit_customers(
  text, text, numeric, numeric, numeric, numeric, numeric, numeric, integer, integer, boolean, integer, integer
) TO authenticated;

COMMENT ON FUNCTION public.list_trusted_credit_customers(
  text, text, numeric, numeric, numeric, numeric, numeric, numeric, integer, integer, boolean, integer, integer
) IS
'AFK-G3-004: Sanitized read model for trusted credit customers. Exposes safe computed account-sale limit to internal authenticated users without granting direct customer_credit_profile sensitive access. Migration 452: profile-fed columns (total_purchases, credit_score, credit_limit, outstanding_balance) report NULL rather than 0 when the customer has no customer_credit_profile row, and has_credit_profile states whether one exists; trust and allowed-credit logic is unchanged.';
