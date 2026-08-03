SET client_encoding='UTF8';

-- =============================================================================
-- Issue 219 / C4.2 — assigning, reassigning and unassigning a purchase request
-- =============================================================================
-- One RPC covers all three, because they are the same operation with different
-- targets: set the owner to X, to Y, or to nobody. Splitting them would give
-- three places to get the locking and the audit wrong instead of one.
--
-- Where the history goes
-- ----------------------
-- NOT into purchase_request_status_history. That table is status-shaped —
-- to_status is NOT NULL — so recording an assignment there would mean writing a
-- fake transition such as approved -> approved. The project already has a
-- pattern for assignment history and it is audit_logs: product_owner_assigned
-- (381 rows) and product_owner_revoked (19) are recorded exactly that way.
-- This follows it. No new history table is introduced, because nothing here
-- needs one that audit_logs does not already provide.
--
-- Lost updates
-- ------------
-- Two managers can have the assign dialog open at once. Without a check, the
-- second to press save silently overwrites the first, and neither of them ever
-- finds out. p_expected_current_assignee_id carries what the caller believed
-- the current owner to be; if reality has moved on, the call is refused and the
-- UI refreshes instead of guessing.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assign_purchase_request(
  p_request_id                   uuid,
  p_assignee_id                  uuid    DEFAULT NULL,
  p_note                         text    DEFAULT NULL,
  p_expected_current_assignee_id uuid    DEFAULT NULL,
  p_expect_provided              boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _uid        uuid := auth.uid();
  _req        public.purchase_requests%ROWTYPE;
  _prev       uuid;
  _prev_name  text;
  _new_name   text;
  _changed    boolean;
  _mgr        record;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.'
      USING ERRCODE = '42501', HINT = 'AUTH_REQUIRED';
  END IF;

  -- Admin and manager only. A purchase_specialist deliberately cannot take a
  -- request from a colleague: self-assignment was not part of the approved
  -- design, and the safe default for "not decided" is "not allowed".
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'شما اجازه تعیین مسئول خرید را ندارید.'
      USING ERRCODE = '42501', HINT = 'ASSIGN_PERMISSION_DENIED';
  END IF;

  -- The lock is taken before anything is validated, so two concurrent calls
  -- serialise here rather than racing between the check and the update.
  SELECT * INTO _req FROM public.purchase_requests
   WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'درخواست خرید پیدا نشد.'
      USING ERRCODE = 'P0002', HINT = 'REQUEST_NOT_FOUND';
  END IF;

  _prev := _req.assigned_to;

  -- A cancelled request is finished. Moving its ownership would suggest there
  -- is still work to do on it. Legacy requests, by contrast, stay assignable:
  -- they are ordinary open work that merely lacks a document history.
  IF _req.status = 'cancelled' THEN
    RAISE EXCEPTION 'این درخواست لغو شده است و مسئول آن قابل تغییر نیست.'
      USING ERRCODE = '22023', HINT = 'REQUEST_CANCELLED';
  END IF;

  -- Optimistic concurrency. Only enforced when the caller actually told us what
  -- it expected — p_expect_provided distinguishes "I expect nobody" from
  -- "I did not check", which a bare NULL cannot express.
  IF p_expect_provided
     AND _prev IS DISTINCT FROM p_expected_current_assignee_id THEN
    RAISE EXCEPTION 'مسئول این درخواست هم‌زمان توسط کاربر دیگری تغییر کرده است.'
      USING ERRCODE = '40001', HINT = 'ASSIGNMENT_CONFLICT';
  END IF;

  IF p_assignee_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_assignee_id) THEN
      RAISE EXCEPTION 'کاربر انتخاب‌شده پیدا نشد.'
        USING ERRCODE = 'P0002', HINT = 'ASSIGNEE_NOT_FOUND';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles
                    WHERE id = p_assignee_id AND is_active AND status = 'active') THEN
      RAISE EXCEPTION 'کاربر انتخاب‌شده غیرفعال است.'
        USING ERRCODE = '22023', HINT = 'ASSIGNEE_INACTIVE';
    END IF;

    IF NOT public.is_valid_purchase_assignee(p_assignee_id) THEN
      RAISE EXCEPTION 'کاربر انتخاب‌شده نقش مناسب مسئول خرید را ندارد.'
        USING ERRCODE = '22023', HINT = 'ASSIGNEE_ROLE_INVALID';
    END IF;
  END IF;

  _changed := _prev IS DISTINCT FROM p_assignee_id;

  SELECT full_name INTO _prev_name FROM public.profiles WHERE id = _prev;
  SELECT full_name INTO _new_name  FROM public.profiles WHERE id = p_assignee_id;

  -- A no-op is a success, not an error: a retried request and a double-click
  -- both land here, and both should be told "this is already the case". What a
  -- no-op must NOT do is emit a second notification or a second audit row.
  IF NOT _changed THEN
    RETURN jsonb_build_object(
      'request_id', p_request_id,
      'previous_assignee', CASE WHEN _prev IS NULL THEN NULL
             ELSE jsonb_build_object('id', _prev, 'name', _prev_name) END,
      'new_assignee', CASE WHEN p_assignee_id IS NULL THEN NULL
             ELSE jsonb_build_object('id', p_assignee_id, 'name', _new_name) END,
      'is_unassigned', p_assignee_id IS NULL,
      'changed', false
    );
  END IF;

  UPDATE public.purchase_requests
     SET assigned_to = p_assignee_id, updated_at = now()
   WHERE id = p_request_id;

  -- ---- notifications --------------------------------------------------------
  IF p_assignee_id IS NOT NULL THEN
    INSERT INTO public.notification_events
      (event_type, user_id, channel, payload, status)
    VALUES (
      'purchase_request_assigned', p_assignee_id, 'in_app',
      jsonb_build_object(
        'title','مسئول خرید شما شدید',
        'body','یک درخواست خرید به شما تخصیص داده شد.',
        'reference_type','purchase_request',
        'reference_id', p_request_id
      ),
      'pending'
    );
  END IF;

  -- The person who loses the request is told too, so work does not disappear
  -- from under them without explanation.
  IF _prev IS NOT NULL THEN
    INSERT INTO public.notification_events
      (event_type, user_id, channel, payload, status)
    VALUES (
      'purchase_request_reassigned', _prev, 'in_app',
      jsonb_build_object(
        'title','درخواست خرید از شما گرفته شد',
        'body', CASE WHEN p_assignee_id IS NULL
                     THEN 'یک درخواست خرید دیگر به شما تخصیص ندارد.'
                     ELSE 'یک درخواست خرید به همکار دیگری تخصیص داده شد.' END,
        'reference_type','purchase_request',
        'reference_id', p_request_id,
        'note', p_note
      ),
      'pending'
    );
  END IF;

  -- Unassigning leaves the request ownerless, which is the same situation
  -- create_purchase_request warns about, so it warns the same audience.
  IF p_assignee_id IS NULL THEN
    FOR _mgr IN
      SELECT DISTINCT p.id FROM public.profiles p
       WHERE p.is_active AND p.status = 'active'
         AND public.has_any_role(p.id, ARRAY['admin','manager']::text[])
    LOOP
      INSERT INTO public.notification_events
        (event_type, user_id, channel, payload, status)
      VALUES (
        'purchase_request_unassigned', _mgr.id, 'in_app',
        jsonb_build_object(
          'title','درخواست خرید بدون مسئول',
          'body','مسئول یک درخواست خرید برداشته شد.',
          'reference_type','purchase_request',
          'reference_id', p_request_id,
          'note', p_note
        ),
        'pending'
      );
    END LOOP;
  END IF;

  -- ---- audit ----------------------------------------------------------------
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'purchase_request', p_request_id::text,
    CASE WHEN p_assignee_id IS NULL THEN 'purchase_request_unassigned'
         ELSE 'purchase_request_assigned' END,
    _uid,
    jsonb_build_object('from', _prev, 'to', p_assignee_id, 'note', p_note)
  );

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'previous_assignee', CASE WHEN _prev IS NULL THEN NULL
           ELSE jsonb_build_object('id', _prev, 'name', _prev_name) END,
    'new_assignee', CASE WHEN p_assignee_id IS NULL THEN NULL
           ELSE jsonb_build_object('id', p_assignee_id, 'name', _new_name) END,
    'is_unassigned', p_assignee_id IS NULL,
    'changed', true
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.assign_purchase_request(uuid, uuid, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.assign_purchase_request(uuid, uuid, text, uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.assign_purchase_request(uuid, uuid, text, uuid, boolean) IS
  'Issue 219 C4: assign / reassign / unassign a purchase request. Admin and '
  'manager only. Row-locked, optimistic-concurrency checked, audited once.';

-- -----------------------------------------------------------------------------
-- Finding the ownerless requests
-- -----------------------------------------------------------------------------
-- Everything below except the new parameter, the _is_priv flag and one extra
-- WHERE clause is the live C3 definition, copied verbatim from
-- pg_get_functiondef. Re-typing it from memory is how a function quietly loses
-- a clause; this one carries the visibility rule that keeps a salesperson from
-- reading other people's requests, and it is not being touched.
--
-- The 4-argument signature is dropped rather than left behind: adding a
-- defaulted parameter overloads a function instead of replacing it, and every
-- existing call would then be ambiguous. Existing callers pass named arguments
-- and keep working against the 5-argument version.
DROP FUNCTION IF EXISTS public.get_purchase_requests(text, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_purchase_requests(p_status text DEFAULT NULL::text, p_product_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_unassigned_only boolean DEFAULT false)
 RETURNS TABLE(id uuid, product_id uuid, product_name text, quantity numeric, unit text, status text, requested_by uuid, requester_name text, assigned_to uuid, assignee_name text, inquiry_id uuid, expected_price numeric, final_price numeric, notes text, created_at timestamp with time zone, receipt_count bigint, legacy_no_fulfillment boolean, supplied_quantity numeric, effective_supplied numeric, remaining_quantity numeric, fulfillment_state text, purchase_count integer, has_over_allocation boolean, purchase_summaries jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _uid       uuid := auth.uid();
  _can_money boolean;
  _is_priv   boolean;
BEGIN
  -- Mirrors the SELECT policy on purchase_items, which excludes `sales`.
  _can_money := public.has_any_role(_uid, ARRAY['admin','manager','accountant']::text[]);
  -- C4: only admin/manager see every request, so only they can meaningfully
  -- ask for the ownerless ones. For anyone else the visibility clause below
  -- already makes the answer empty.
  _is_priv   := public.has_any_role(_uid, ARRAY['admin','manager']::text[]);

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
    ) and
    -- C4: the "unassigned" filter. Not a status value — the status CHECK would
    -- reject one — so it gets its own parameter.
    (not p_unassigned_only or (pr.assigned_to is null and _is_priv))
  ORDER BY pr.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;


REVOKE EXECUTE ON FUNCTION
  public.get_purchase_requests(text, uuid, integer, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.get_purchase_requests(text, uuid, integer, integer, boolean) TO authenticated;
