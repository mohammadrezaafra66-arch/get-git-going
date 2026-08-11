SET client_encoding='UTF8';

-- =============================================================================
-- 253 — Issue 219 / C3.5: fulfillment summary on the purchase-request list
-- =============================================================================
--
-- WHY EXTEND THIS FUNCTION RATHER THAN ADD A NEW ONE
--   The card already renders from get_purchase_requests. Fetching the summary
--   separately would be one extra round trip per card — a textbook N+1 on a
--   list. Everything the card needs comes back in the same row.
--
-- ⚠️ THE FAN-OUT TRAP THIS MIGRATION AVOIDS
--   The existing body does `count(rc.id)` over a LEFT JOIN to purchase_receipts
--   with a GROUP BY. Adding a second LEFT JOIN (to fulfillments) would multiply
--   the receipt rows by the fulfillment rows and silently inflate
--   receipt_count. Every aggregate added here is therefore a self-contained
--   LATERAL subquery, and the receipt count is moved into one too so the
--   GROUP BY disappears entirely.
--
-- ROLE-AWARE MASKING, DECIDED SERVER-SIDE
--   purchase_summaries carries purchase price and supplier name. RLS on
--   purchase_items already hides purchase economics from `sales`, and the
--   fulfillment views are not granted to clients at all. This function is
--   SECURITY DEFINER, so it must reproduce that rule itself rather than inherit
--   it: for a caller who is not admin/manager/accountant the price, currency,
--   total and supplier keys are omitted from every summary entry.
--
--   A salesperson still sees that their request was supplied, by how much, on
--   what date and into which warehouse — just not what it cost or from whom.
--
-- LEGACY ROWS REPORT NULL, NEVER A FABRICATED ZERO
--   A legacy request's supplied quantity is unknown, not zero. Returning 0
--   would render as "delivered, 0 of 5 supplied", a claim the data does not
--   support.
--
-- SIGNATURE UNCHANGED, COLUMNS APPENDED
--   Existing callers keep working: RETURNS TABLE grows at the end, and the old
--   frontend simply ignores the new columns.
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_purchase_requests(text, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_purchase_requests(
  p_status     text    DEFAULT NULL,
  p_product_id uuid    DEFAULT NULL,
  p_limit      integer DEFAULT 20,
  p_offset     integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  product_id uuid,
  product_name text,
  quantity numeric,
  unit text,
  status text,
  requested_by uuid,
  requester_name text,
  assigned_to uuid,
  assignee_name text,
  inquiry_id uuid,
  expected_price numeric,
  final_price numeric,
  notes text,
  created_at timestamp with time zone,
  receipt_count bigint,
  -- Issue 219 additions
  legacy_no_fulfillment boolean,
  supplied_quantity numeric,
  effective_supplied numeric,
  remaining_quantity numeric,
  fulfillment_state text,
  purchase_count integer,
  has_over_allocation boolean,
  purchase_summaries jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _uid       uuid := auth.uid();
  _can_money boolean;
BEGIN
  -- Mirrors the SELECT policy on purchase_items, which excludes `sales`.
  _can_money := public.has_any_role(_uid, ARRAY['admin','manager','accountant']::text[]);

  RETURN QUERY
  SELECT
    pr.id,
    pr.product_id,
    p.name,
    pr.quantity,
    pr.unit,
    pr.status,
    pr.requested_by,
    rq.full_name,
    pr.assigned_to,
    aq.full_name,
    pr.inquiry_id,
    pr.expected_price,
    pr.final_price,
    pr.notes,
    pr.created_at,

    -- scalar subquery, not a join: cannot be inflated by the fulfillment data
    (SELECT COUNT(*) FROM public.purchase_receipts rc WHERE rc.request_id = pr.id),

    pr.legacy_no_fulfillment,

    CASE WHEN pr.legacy_no_fulfillment THEN NULL ELSE COALESCE(f.total_allocated, 0) END,
    CASE WHEN pr.legacy_no_fulfillment THEN NULL
         ELSE LEAST(COALESCE(f.total_allocated, 0), pr.quantity) END,
    CASE WHEN pr.legacy_no_fulfillment THEN NULL
         ELSE GREATEST(pr.quantity - COALESCE(f.total_allocated, 0), 0) END,
    CASE
      WHEN pr.legacy_no_fulfillment                THEN 'legacy_unknown'
      WHEN COALESCE(f.total_allocated, 0) = 0      THEN 'none'
      WHEN f.total_allocated < pr.quantity         THEN 'partial'
      ELSE 'complete'
    END,
    COALESCE(f.purchase_count, 0)::integer,
    COALESCE(f.has_over, false),
    COALESCE(s.summaries, '[]'::jsonb)

  FROM public.purchase_requests pr
  JOIN public.products p        ON p.id  = pr.product_id
  JOIN public.profiles rq       ON rq.id = pr.requested_by
  LEFT JOIN public.profiles aq  ON aq.id = pr.assigned_to

  LEFT JOIN LATERAL (
    SELECT SUM(x.allocated_quantity)             AS total_allocated,
           COUNT(DISTINCT x.purchase_id)         AS purchase_count,
           bool_or(x.is_over_allocation)         AS has_over
    FROM public.purchase_request_fulfillments x
    WHERE x.purchase_request_id = pr.id
  ) f ON true

  LEFT JOIN LATERAL (
    SELECT jsonb_agg(entry ORDER BY entry->>'purchase_date' DESC) AS summaries
    FROM (
      SELECT jsonb_strip_nulls(jsonb_build_object(
               'purchase_id',        pu.id,
               'short_id',           left(pu.id::text, 8),
               'purchase_date',      to_char(pu.purchase_date, 'YYYY-MM-DD'),
               'purchased_quantity', pi.quantity,
               'allocated_quantity', ff.allocated_quantity,
               'is_over_allocation', ff.is_over_allocation,
               'warehouse_name',     (SELECT w.name FROM public.warehouses w WHERE w.id = pu.warehouse_id),
               -- financial columns only for roles allowed to see them
               'purchase_price',     CASE WHEN _can_money THEN pu.purchase_price END,
               'currency',           CASE WHEN _can_money THEN pu.currency END,
               'total_amount',       CASE WHEN _can_money THEN pu.total_amount END,
               'supplier_name',      CASE WHEN _can_money
                                          THEN (SELECT su.name FROM public.suppliers su
                                                 WHERE su.id = pu.supplier_id) END
             )) AS entry
      FROM public.purchase_request_fulfillments ff
      JOIN public.purchases pu       ON pu.id = ff.purchase_id
      LEFT JOIN public.purchase_items pi ON pi.id = ff.purchase_item_id
      WHERE ff.purchase_request_id = pr.id
    ) e
  ) s ON true

  WHERE
    (p_status is null or pr.status = p_status) and
    (p_product_id is null or pr.product_id = p_product_id) and
    (
      pr.requested_by = _uid or
      pr.assigned_to = _uid or
      public.has_role(_uid, 'admin') or
      public.has_role(_uid, 'manager')
    )
  ORDER BY pr.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

COMMENT ON FUNCTION public.get_purchase_requests(text, uuid, integer, integer) IS
  'مورد ۲۱۹ (۲۵۳). همان تابع قبلی به‌علاوهٔ خلاصهٔ تأمین هر درخواست. تمام Aggregateها LATERAL هستند و receipt_count به subquery اسکالر منتقل شده تا افزودن دادهٔ تأمین آن را متورم نکند. ستون‌های مالی (قیمت، ارز، مبلغ، تأمین‌کننده) فقط برای admin/manager/accountant برگردانده می‌شوند — منطبق بر سیاست SELECT جدول purchase_items که نقش sales را کنار می‌گذارد. درخواست‌های قدیمی مقدار NULL می‌گیرند نه صفر ساختگی.';

REVOKE ALL ON FUNCTION public.get_purchase_requests(text, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_requests(text, uuid, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
