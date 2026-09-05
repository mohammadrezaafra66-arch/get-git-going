SET client_encoding='UTF8';

-- 453-down — restore list_trusted_credit_customers to its pre-453 shape
-- (migration 20260720110000). Captured from the live test database on
-- 2026-09-05 before 453 was applied. Drops the 22-column form first because
-- CREATE OR REPLACE cannot shrink RETURNS TABLE.

DROP FUNCTION public.list_trusted_credit_customers(
  text, text, numeric, numeric, numeric, numeric, numeric, numeric, integer, integer, boolean, integer, integer
);

CREATE FUNCTION public.list_trusted_credit_customers(p_search text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_min_total_purchases numeric DEFAULT NULL::numeric, p_max_total_purchases numeric DEFAULT NULL::numeric, p_min_allowed_credit numeric DEFAULT NULL::numeric, p_max_allowed_credit numeric DEFAULT NULL::numeric, p_min_outstanding_balance numeric DEFAULT NULL::numeric, p_max_outstanding_balance numeric DEFAULT NULL::numeric, p_min_credit_score integer DEFAULT NULL::integer, p_max_credit_score integer DEFAULT NULL::integer, p_only_trusted boolean DEFAULT false, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(customer_id uuid, customer_name text, phone text, easy_code text, responsible_id uuid, responsible_name text, total_purchases numeric, credit_score integer, credit_limit numeric, available_credit numeric, held_credit numeric, outstanding_balance numeric, computed_allowed_credit numeric, has_active_overdue boolean, overdue_amount numeric, overdue_count integer, oldest_due_date date, is_trusted boolean, status_code text, status_reason text, total_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
      COALESCE(ccp.total_purchases, 0)::numeric AS total_purchases,
      COALESCE(ccp.credit_score, 0)::int AS credit_score,
      COALESCE(ccp.credit_limit, 0)::numeric AS credit_limit,
      COALESCE(
        ccb.available_credit,
        GREATEST(COALESCE(ccp.credit_limit, 0) - COALESCE(ccp.outstanding_balance, 0), 0),
        0
      )::numeric AS available_credit,
      COALESCE(ccb.held_credit, 0)::numeric AS held_credit,
      COALESCE(ccp.outstanding_balance, 0)::numeric AS outstanding_balance,
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
    COUNT(*) OVER()::int AS total_count
  FROM filtered f
  ORDER BY f.is_trusted DESC, f.computed_allowed_credit DESC, f.customer_name ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$function$;

REVOKE EXECUTE ON FUNCTION public.list_trusted_credit_customers(
  text, text, numeric, numeric, numeric, numeric, numeric, numeric, integer, integer, boolean, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_trusted_credit_customers(
  text, text, numeric, numeric, numeric, numeric, numeric, numeric, integer, integer, boolean, integer, integer
) TO authenticated;
