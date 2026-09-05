SET client_encoding='UTF8';

-- 408 — OG-79: an accepted quote RESERVES ceiling (option ب), the shortfall is visible and
-- audited, and a stale reservation cannot lock a customer's ceiling forever.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- THE PERMANENT-LOCK PROBLEM, AND WHICH OF THE THREE ROUTES THIS TAKES
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- `sales_quotes_validate_status` forbids `accepted → canceled`, and release happens on payment.
-- So an accepted quote that is never paid holds ceiling forever. Over months a good customer's
-- ceiling fills with forgotten quotes and nothing says why. That is a leak, not a design.
--
--   ROUTE A — a legitimate cancel path for accepted quotes (a new status + a permission).
--     Needs a new value on the `sales_quote_status` enum, a change to the validate trigger, a
--     new permission and a UI. **And it does not fix the stated problem**: a forgotten quote is
--     by definition one nobody is thinking about, so a route that requires someone to remember
--     cannot reclaim it. Worth having, insufficient alone.
--
--   ROUTE B — time expiry: a reservation older than N days with no payment is released.
--     **This is the route taken**, because it targets exactly the failure — abandonment — and
--     because it is NOT a new mechanism here. This project already sweeps by time twice:
--     `expire_pending_documents` and `expire_pending_delivery_receipts`, both `SECURITY DEFINER`
--     functions that loop `FOR UPDATE`, change state and write a history row, called
--     opportunistically by the app. Measured: there is **no `pg_cron` and no `pg_net`** on this
--     database, so a cron-based design would have needed infrastructure that does not exist;
--     the established sweep pattern needs none.
--
--   ROUTE C — derive the hold instead of storing it (compute it from accepted-unpaid quotes).
--     Genuinely attractive: a derived number cannot DRIFT, and every stored aggregate in this
--     project has drifted. Rejected here for two reasons. It does not solve abandonment either —
--     an abandoned quote still counts, forever — so it needs an expiry predicate anyway. And the
--     owner's constraints require an AUDIT TRAIL of who exceeded a ceiling and when, which a
--     derived number cannot carry: there is no event to record. Recorded rather than discarded;
--     if drift ever appears in `held_credit`, this is the repair.
--
-- **The recommendation is B now and A later.** They are complementary: B reclaims what is
-- forgotten, A lets someone deliberately release without waiting N days. A is raised as OG-80.
--
-- **N IS A BUSINESS NUMBER AND IS NOT INVENTED SILENTLY.** `expire_stale_credit_holds` takes it
-- as a parameter with a default of 60 days, chosen only so the function is callable. The owner
-- sets the real value; the gate row records that it is unset.
--
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- OPTION (ب) AND ITS THREE CONDITIONS
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- A quote above the ceiling is ACCEPTED, not refused — the counter keeps working — but:
--   1. VISIBLE. `public.v_customer_credit_exposure` answers "who exceeded their ceiling and by
--      how much" in one query. The shortfall was already storable — `sales_quotes` has
--      `quote_exception_type/_amount/_text/_snapshot` and `credit_check_snapshot` — but nothing
--      aggregated it, so the answer existed and was unreachable.
--   2. AUDITED. Every over-ceiling acceptance writes `audit_logs` action
--      `credit_ceiling_exceeded` with actor, quote, requested, reserved and shortfall.
--   3. NEVER NEGATIVE. The reservation is `LEAST(amount, available)`, so a hold can consume the
--      ceiling to exactly zero and never past it. The excess is recorded, not reserved.

-- ─── 1. Reserve for a quote: option (ب) semantics ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hold_credit_for_quote(p_quote_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cust      uuid;
  _amount    numeric;
  _avail     numeric;
  _reserve   numeric;
  _short     numeric;
BEGIN
  SELECT q.customer_id, q.final_amount INTO _cust, _amount
    FROM public.sales_quotes q WHERE q.id = p_quote_id;

  IF _cust IS NULL OR COALESCE(_amount, 0) <= 0 THEN
    RETURN;   -- nothing to reserve against; not an error
  END IF;

  SELECT g.available_credit INTO _avail
    FROM public.get_customer_dynamic_credit(_cust) g;
  _avail := GREATEST(COALESCE(_avail, 0), 0);

  -- Condition 3: reserve at most what exists. The ceiling reaches zero and never goes below.
  _reserve := LEAST(_amount, _avail);
  _short   := GREATEST(_amount - _avail, 0);

  IF _reserve > 0 THEN
    PERFORM public.hold_credit(_cust, _reserve, p_quote_id, p_user_id);
  END IF;

  IF _short > 0 THEN
    -- Condition 1: the shortfall is RECORDED on the quote, in the fields the UI already uses,
    -- so one surface describes it rather than two.
    UPDATE public.sales_quotes
       SET quote_exception_type   = COALESCE(quote_exception_type, 'credit_ceiling_exceeded'),
           quote_exception_amount = _short,
           quote_exception_text   = COALESCE(quote_exception_text,
             'مبلغ پیش‌فاکتور از سقف اعتبار مشتری بیشتر است؛ مابه‌التفاوت رزرو نشد.'),
           quote_exception_snapshot = jsonb_build_object(
             'requested', _amount, 'available', _avail, 'reserved', _reserve, 'shortfall', _short,
             'at', now())
     WHERE id = p_quote_id;

    -- Condition 2: who, when, how much over.
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (p_user_id, 'sales_quote', p_quote_id, 'credit_ceiling_exceeded',
            jsonb_build_object('customer_id', _cust, 'requested', _amount,
                               'available', _avail, 'reserved', _reserve, 'shortfall', _short));
  END IF;
END
$function$;

-- ─── 2. Visibility: one query answers the owner's question ───────────────────────────────────
CREATE OR REPLACE VIEW public.v_customer_credit_exposure AS
SELECT q.customer_id,
       q.customer_name,
       count(*)                              AS quotes_over_ceiling,
       sum(q.quote_exception_amount)         AS total_shortfall,
       max(q.updated_at)                     AS last_exceeded_at,
       sum(COALESCE(b.held_credit, 0))       AS held_credit
  FROM public.sales_quotes q
  LEFT JOIN public.customer_credit_balance b ON b.customer_id = q.customer_id
 WHERE q.quote_exception_type = 'credit_ceiling_exceeded'
   AND COALESCE(q.quote_exception_amount, 0) > 0
 GROUP BY q.customer_id, q.customer_name;

COMMENT ON VIEW public.v_customer_credit_exposure IS
  'OG-79 condition 1: who exceeded their credit ceiling and by how much. The shortfall was '
  'already stored on sales_quotes.quote_exception_amount; nothing aggregated it, so the answer '
  'existed and was unreachable. Read it with: SELECT * FROM public.v_customer_credit_exposure '
  'ORDER BY total_shortfall DESC;';

-- Same grants as the credit reader it complements. `anon` gets nothing.
GRANT SELECT ON public.v_customer_credit_exposure TO authenticated, service_role;

-- ─── 3. The sweep: a stale reservation cannot lock a ceiling forever ─────────────────────────
CREATE OR REPLACE FUNCTION public.expire_stale_credit_holds(p_days integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row     record;
  _n       integer := 0;
BEGIN
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'بازهٔ انقضای رزرو باید حداقل یک روز باشد' USING ERRCODE = '22023';
  END IF;

  -- A hold is stale when its ledger row is older than p_days AND no release has been recorded
  -- against the same quote. Derived from the ledger rather than from a new column: the ledger
  -- already records both sides with `reference_id`, so there is nothing extra to keep in step.
  FOR _row IN
    SELECT l.customer_id, l.reference_id AS quote_id, sum(l.amount) AS held_amount
      FROM public.customer_credit_ledger l
     WHERE l.transaction_type = 'hold'
       AND l.reference_type = 'sales_quote'
       AND l.created_at < now() - make_interval(days => p_days)
       AND NOT EXISTS (
         SELECT 1 FROM public.customer_credit_ledger r
          WHERE r.transaction_type = 'release'
            AND r.reference_id = l.reference_id)
     GROUP BY l.customer_id, l.reference_id
  LOOP
    PERFORM public.release_credit(_row.customer_id, _row.held_amount, _row.quote_id, NULL);

    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (NULL, 'sales_quote', _row.quote_id, 'credit_hold_expired',
            jsonb_build_object('customer_id', _row.customer_id, 'released', _row.held_amount,
                               'after_days', p_days,
                               'reason', 'رزرو اعتبار پس از مهلت بدون پرداخت آزاد شد'));
    _n := _n + 1;
  END LOOP;

  RETURN _n;
END
$function$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_credit_holds(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_credit_holds(integer) TO authenticated, service_role;

-- ─── 4. Wire the reservation into quote acceptance ───────────────────────────────────────────
-- The live body, byte-for-byte, with ONE `PERFORM` added after the status UPDATE. Signature
-- unchanged, so CREATE OR REPLACE is correct and no overload is possible (safety rule 5).
CREATE OR REPLACE FUNCTION public.update_sales_quote_status(p_quote_id uuid, p_next sales_quote_status, p_reason text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, status sales_quote_status, cancel_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.sales_quotes%ROWTYPE;
  _reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  _missing text;
  _svc_lines text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row
  FROM public.sales_quotes sq
  WHERE sq.id = p_quote_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'پیش‌فاکتور یافت نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF public.has_any_role(_uid, ARRAY['admin','manager']::public.app_role[]) THEN
    NULL;
  ELSIF public.has_role(_uid, 'accountant'::public.app_role)
        AND p_next = 'rejected'::public.sales_quote_status THEN
    NULL;
  ELSIF public.has_role(_uid, 'sales'::public.app_role)
        AND _row.salesperson_id = _uid
        AND p_next IN ('draft'::public.sales_quote_status,
                       'sent'::public.sales_quote_status,
                       'rejected'::public.sales_quote_status,
                       'canceled'::public.sales_quote_status) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'دسترسی لازم برای این عملیات را ندارید.' USING ERRCODE = '42501';
  END IF;

  IF p_next = 'canceled'::public.sales_quote_status AND _reason IS NULL THEN
    RAISE EXCEPTION 'برای لغو پیش‌فاکتور، دلیل لغو الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_next = 'rejected'::public.sales_quote_status AND _reason IS NULL THEN
    RAISE EXCEPTION 'برای رد پیش‌فاکتور، نوشتن دلیل رد الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_next = 'canceled'::public.sales_quote_status THEN
    UPDATE public.sales_quotes AS sq
       SET status = p_next,
           cancel_reason = _reason
     WHERE sq.id = p_quote_id;
  ELSIF p_next = 'rejected'::public.sales_quote_status THEN
    UPDATE public.sales_quotes AS sq
       SET status = p_next,
           reject_reason = _reason
     WHERE sq.id = p_quote_id;

    IF _row.salesperson_id IS NOT NULL THEN
      INSERT INTO public.notification_queue(
        user_id,
        title,
        body,
        type,
        reference_type,
        reference_id
      )
      VALUES (
        _row.salesperson_id,
        'پیش‌فاکتور رد شد',
        concat_ws(E'\n',
          'پیش‌فاکتور ' || COALESCE(_row.quote_number, p_quote_id::text) || ' توسط واحد حسابداری/مدیریت رد شد.',
          'مشتری: ' || COALESCE(NULLIF(_row.customer_name, ''), '—'),
          'دلیل رد: ' || _reason
        ),
        'quote_rejected',
        'sales_quote',
        p_quote_id
      );
    END IF;
  ELSE
    -- ================= requirement 223 — layers 4 and 5 =================
    IF p_next = 'accepted'::public.sales_quote_status THEN
      -- Re-apply first. A line inserted before the rule existed, or one whose
      -- product was re-categorised after the line was created, would otherwise
      -- fail a check it never had the chance to satisfy.
      PERFORM public.apply_required_services_for_quote_item(i.id)
      FROM public.sales_quote_items i
      WHERE i.quote_id = p_quote_id;

      -- Then verify. If anything is still missing the obligation was defeated
      -- somehow, and finalising would ship an unpackaged television.
      SELECT string_agg(DISTINCT COALESCE(NULLIF(i.title_snapshot, ''), 'کالای بدون نام'), '، ')
        INTO _missing
      FROM public.sales_quote_items i
      JOIN public.products p                     ON p.id  = i.product_id
      JOIN public.category_required_services crs ON crs.category_id = p.category_id
      JOIN public.product_service_types st       ON st.id = crs.service_type_id
      WHERE i.quote_id = p_quote_id
        AND crs.is_active AND crs.is_mandatory AND st.is_active
        AND NOT EXISTS (
          SELECT 1 FROM public.sales_quote_item_services s
          WHERE s.quote_item_id = i.id
            AND s.service_type_id = crs.service_type_id
        );

      IF _missing IS NOT NULL THEN
        RAISE EXCEPTION 'خدمت اجباری برای این کالاها ثبت نشده است: %', _missing
          USING ERRCODE = '23514';
      END IF;
    END IF;

    UPDATE public.sales_quotes AS sq
       SET status = p_next
     WHERE sq.id = p_quote_id;

    -- OG-79 / M11. Finalising a quote CONSUMES ceiling. Option (ب): an over-ceiling quote is
    -- ACCEPTED, never refused — the counter keeps working — but the shortfall is reserved
    -- nowhere, recorded on the quote and written to audit_logs. `hold_credit_for_quote` caps the
    -- reservation at LEAST(amount, available), so a hold can take the ceiling to exactly zero
    -- and never past it.
    --
    -- Placed AFTER the status UPDATE deliberately: the reservation describes an accepted quote,
    -- so if any check above raises, the whole transaction rolls back and nothing is held.
    IF p_next = 'accepted'::public.sales_quote_status THEN
      PERFORM public.hold_credit_for_quote(p_quote_id, auth.uid());
    END IF;

    -- Warehouse preparation must SEE the obligation, not just the document.
    -- Queue 'store' is used because tasks_assigned_queue_check permits only
    -- sales/shipping/store/accounting — inventing a 'warehouse' queue would
    -- mean widening a CHECK that other code already relies on.
    IF p_next = 'accepted'::public.sales_quote_status THEN
      SELECT string_agg(
               COALESCE(NULLIF(i.title_snapshot, ''), 'کالای بدون نام')
                 || ' — ' || COALESCE(s.display_text, st.name_fa),
               E'\n' ORDER BY i.created_at)
        INTO _svc_lines
      FROM public.sales_quote_items i
      JOIN public.sales_quote_item_services s ON s.quote_item_id = i.id
      JOIN public.product_service_types st    ON st.id = s.service_type_id
      WHERE i.quote_id = p_quote_id AND s.is_mandatory;

      IF _svc_lines IS NOT NULL THEN
        INSERT INTO public.tasks (
          title, description, status, priority,
          reference_type, reference_id, assigned_queue, created_by
        )
        SELECT
          'خدمات اجباری پیش‌فاکتور ' || COALESCE(_row.quote_number, p_quote_id::text),
          _svc_lines,
          'pending', 'high',
          'sales_quote', p_quote_id, 'store', _uid
        -- Idempotent: re-accepting an already-accepted proforma must not pile
        -- up duplicate work orders for the warehouse.
        WHERE NOT EXISTS (
          SELECT 1 FROM public.tasks t
          WHERE t.reference_type = 'sales_quote'
            AND t.reference_id = p_quote_id
            AND t.assigned_queue = 'store'
            AND t.status <> 'canceled'
        );
      END IF;
    END IF;
    -- =====================================================================
  END IF;

  RETURN QUERY
  SELECT sq.id, sq.status, sq.cancel_reason
  FROM public.sales_quotes sq
  WHERE sq.id = p_quote_id;
END;
$function$;

DO $verify$
DECLARE
  v_ok boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='v_customer_credit_exposure') THEN
    RAISE EXCEPTION '408: the exposure view was not created';
  END IF;

  -- Condition 3 asserted as SHAPE: the reservation must be a LEAST, or it could exceed the
  -- ceiling and drive available credit negative.
  IF regexp_replace(pg_get_functiondef('public.hold_credit_for_quote'::regproc), '--[^\n]*', '', 'g')
       NOT ILIKE '%LEAST(_amount, _avail)%' THEN
    RAISE EXCEPTION '408: the reservation is not capped at the available ceiling';
  END IF;

  -- Condition 2: the over-ceiling event must be audited.
  IF regexp_replace(pg_get_functiondef('public.hold_credit_for_quote'::regproc), '--[^\n]*', '', 'g')
       NOT ILIKE '%credit_ceiling_exceeded%' THEN
    RAISE EXCEPTION '408: an over-ceiling acceptance is not audited';
  END IF;

  -- The sweep must refuse a nonsense window rather than releasing everything.
  v_ok := false;
  BEGIN
    PERFORM public.expire_stale_credit_holds(0);
  EXCEPTION WHEN invalid_parameter_value THEN v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION '408: expire_stale_credit_holds accepted a zero-day window';
  END IF;

  -- And it must be a no-op today: no holds exist, so nothing may be released.
  IF public.expire_stale_credit_holds(60) <> 0 THEN
    RAISE EXCEPTION '408: the sweep released something when no hold exists';
  END IF;

  RAISE NOTICE '408: verified - reservation capped at the ceiling, over-ceiling audited, sweep guarded and idempotent';
END
$verify$;
