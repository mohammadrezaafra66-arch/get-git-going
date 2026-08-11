SET client_encoding='UTF8';

-- =============================================================================
-- 249 — Issue 219 / C1.4: fulfillment views
-- =============================================================================
--
-- THREE VIEWS, EACH WITH ONE JOB.
--
--   v_purchase_item_allocation      — line level. The ONLY place excess exists.
--   v_purchase_request_fulfillment  — request level. Deliberately has NO excess.
--   v_purchase_requests_legacy_unknown — the legacy report.
--
-- WHY EXCESS LIVES AT LINE LEVEL AND NOWHERE ELSE
--   A purchase line of 12 split as 6 to request A and 6 to request B has a
--   total excess of ZERO. An earlier draft of this design put excess on the
--   request view, computed as SUM(item.quantity) - SUM(allocated) per request;
--   because the join repeats the line once per request, that formula reported
--   6 units of excess for A and 6 for B — 12 units of excess that do not exist.
--   Excess is a property of the LINE. It is computed once here and read from
--   the purchase summary, never from the request summary.
--
-- WHY LATERAL AND NOT A JOIN + GROUP BY
--   Aggregating purchase_items in the same query that aggregates fulfillments
--   multiplies the line quantity by the number of allocations. Every aggregate
--   below is a self-contained LATERAL subquery, so no value is ever fanned out.
--   The same rule applies to get_purchase_requests when it is extended in C4:
--   its existing count(rc.id) over purchase_receipts would inflate the moment a
--   second LEFT JOIN is added.
--
-- WHY LEGACY ROWS RETURN NULL AND NOT ZERO
--   A legacy request's supplied quantity is UNKNOWN, not zero. Returning 0
--   would render as "delivered, 0 of 5 supplied" — a statement the data does
--   not support. NULL forces the UI to say «نامعلوم».
--
-- SECURITY
--   All three views are security_invoker = true (PostgreSQL 15.6 confirmed, and
--   this option requires 15+). With invoker rights the caller's RLS on the
--   underlying tables applies, so a view cannot be used to read around a policy.
--
--   None of them is granted to `authenticated`. v_purchase_item_allocation in
--   particular joins purchase_items, whose SELECT policy excludes `sales`;
--   exposing it directly would leak purchase economics to salespeople. Client
--   data comes from get_purchase_requests, which applies role-aware masking
--   inside a SECURITY DEFINER function (C4). These views exist for use by the
--   RPCs and for operator queries.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Line level. Excess is computed here, exactly once per purchase line.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_purchase_item_allocation
WITH (security_invoker = true) AS
SELECT
  pi.id                                                        AS purchase_item_id,
  pi.purchase_id,
  pi.product_id,
  pi.quantity                                                  AS purchased_quantity,
  COALESCE(a.total_allocated, 0)                               AS allocated_quantity,
  GREATEST(pi.quantity - COALESCE(a.total_allocated, 0), 0)    AS excess_quantity,
  COALESCE(a.request_count, 0)                                 AS request_count,
  COALESCE(a.request_count, 0) > 1                             AS is_shared_across_requests
FROM public.purchase_items pi
LEFT JOIN LATERAL (
  SELECT SUM(f.allocated_quantity)               AS total_allocated,
         COUNT(DISTINCT f.purchase_request_id)   AS request_count
  FROM public.purchase_request_fulfillments f
  WHERE f.purchase_item_id = pi.id
) a ON true;

COMMENT ON VIEW public.v_purchase_item_allocation IS
  'مورد ۲۱۹: تخصیص در سطح قلم خرید. «مازاد خرید» فقط اینجا معنا دارد و فقط یک‌بار محاسبه می‌شود: قلمی به مقدار ۱۲ که ۶ به یک درخواست و ۶ به درخواست دیگر تخصیص یافته، مازادش صفر است. محاسبهٔ مازاد در سطح درخواست، همان مقدار را به ازای هر درخواست دوباره می‌شمرد.';

-- -----------------------------------------------------------------------------
-- 2. Request level. No excess column, by design.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_purchase_request_fulfillment
WITH (security_invoker = true) AS
SELECT
  pr.id                                          AS purchase_request_id,
  pr.quantity                                    AS requested_quantity,
  pr.legacy_no_fulfillment,

  CASE WHEN pr.legacy_no_fulfillment THEN NULL
       ELSE COALESCE(a.total_allocated, 0) END   AS allocated_quantity,

  -- what decides the request status: allocation capped at what was asked for
  CASE WHEN pr.legacy_no_fulfillment THEN NULL
       ELSE LEAST(COALESCE(a.total_allocated, 0), pr.quantity) END AS effective_supplied,

  CASE WHEN pr.legacy_no_fulfillment THEN NULL
       ELSE GREATEST(pr.quantity - COALESCE(a.total_allocated, 0), 0) END AS remaining_quantity,

  COALESCE(a.purchase_count, 0)                  AS purchase_count,
  COALESCE(a.has_over_allocation, false)         AS has_over_allocation,

  CASE
    WHEN pr.legacy_no_fulfillment                  THEN 'legacy_unknown'
    WHEN COALESCE(a.total_allocated, 0) = 0        THEN 'none'
    WHEN a.total_allocated < pr.quantity           THEN 'partial'
    ELSE 'complete'
  END                                            AS fulfillment_state
FROM public.purchase_requests pr
LEFT JOIN LATERAL (
  SELECT SUM(f.allocated_quantity)       AS total_allocated,
         COUNT(DISTINCT f.purchase_id)   AS purchase_count,
         bool_or(f.is_over_allocation)   AS has_over_allocation
  FROM public.purchase_request_fulfillments f
  WHERE f.purchase_request_id = pr.id
) a ON true;

COMMENT ON VIEW public.v_purchase_request_fulfillment IS
  'مورد ۲۱۹: وضعیت تأمین در سطح درخواست. عمداً ستون «مازاد» ندارد — مازاد فقط در سطح قلم معنا دارد (v_purchase_item_allocation). برای درخواست‌های قدیمیِ بدون سند، مقادیر NULL برمی‌گردد نه صفر: مقدار تأمین‌شده «نامعلوم» است نه «هیچ». effective_supplied همان چیزی است که وضعیت درخواست را تعیین می‌کند و سقفش مقدار درخواست‌شده است، پس بیش‌تخصیص وضعیت را از حالت «کامل» فراتر نمی‌برد.';

-- -----------------------------------------------------------------------------
-- 3. Legacy report.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_purchase_requests_legacy_unknown
WITH (security_invoker = true) AS
SELECT
  pr.id,
  pr.status,
  pr.quantity        AS requested_quantity,
  pr.unit,
  pr.created_at,
  p.name             AS product_name,
  rq.full_name       AS requester_name,
  aq.full_name       AS assignee_name
FROM public.purchase_requests pr
JOIN public.products p         ON p.id  = pr.product_id
LEFT JOIN public.profiles rq   ON rq.id = pr.requested_by
LEFT JOIN public.profiles aq   ON aq.id = pr.assigned_to
WHERE pr.legacy_no_fulfillment;

COMMENT ON VIEW public.v_purchase_requests_legacy_unknown IS
  'مورد ۲۱۹: فهرست درخواست‌هایی که پیش از وجود پیوند سند خرید به وضعیت خرید/تحویل رسیده‌اند و سند مرتبط ندارند، برای تعیین تکلیف دستی مدیر.';

-- -----------------------------------------------------------------------------
-- 4. Access: internal only. Not granted to authenticated.
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.v_purchase_item_allocation          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.v_purchase_request_fulfillment      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.v_purchase_requests_legacy_unknown  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
