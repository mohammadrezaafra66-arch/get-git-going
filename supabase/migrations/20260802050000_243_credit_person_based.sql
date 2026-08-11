SET client_encoding='UTF8';

-- =============================================================================
-- 243 — Phase 8.6: credit functions resolve identity through person_id
-- =============================================================================
--
-- WHY THIS COULD NOT HAPPEN IN PHASE 7
--   Migration 237 deliberately refused to rewrite these functions, and was
--   right to: customers.person_id was not unique, so keying credit on a person
--   would silently SUM the balances of two customers who happened to share one.
--   Migration 240 (Decision 1) removed that hazard — one person now has exactly
--   one customer — so the rewrite is finally safe.
--
-- WHAT CHANGES: ONLY the column that identifies the party.
--   Not one threshold, weight, formula, rounding rule, role check or error
--   message is touched. Every function below is the live definition read with
--   pg_get_functiondef (snapshot:
--   docs/verification/pre-phase8/credit-functions-snapshot.sql) with the
--   identity predicate moved from customer_id to customer_person_id.
--
-- WHY THE REWRITE IS PROVABLY NUMERIC-NEUTRAL
--   customers.person_id is UNIQUE (240) and NOT NULL (233), and every
--   *_person_id column on the credit tables is trigger-derived from its
--   customer_id. So customer_id <-> person_id is a bijection and
--       WHERE customer_id = P   ==   WHERE customer_person_id = person_of(P)
--   select exactly the same rows. The parity gate proves it on real data
--   rather than relying on this argument.
--
--   Precondition verified before writing, not assumed: customer_person_id is
--   declared NOT NULL on customer_credit_balance, customer_credit_profile,
--   customer_credit_ledger and customer_capital_allocations_dynamic, and holds
--   zero NULLs. That matters — a NULL would make the rewritten joins silently
--   match nothing instead of failing loudly.
--
-- WRITES STILL SET customer_id, DELIBERATELY.
--   The *_person_id columns are DERIVED: BEFORE triggers recompute them from
--   the legacy column. An INSERT must therefore keep supplying customer_id, or
--   the trigger has nothing to derive from. Reads and identity resolution move
--   to person; writes keep the legacy key and let the trigger fill the person.
--   The ON CONFLICT targets stay on customer_id for the same reason: that is
--   where the unique indexes are.
--
-- SCOPE, AND WHAT IS DELIBERATELY LEFT ALONE
--   Rewritten (8): the single-party credit entry points, where a caller hands
--     in one customer and the function must resolve WHO that is —
--       _ensure_credit_balance, get_customer_credit, get_customer_dynamic_credit,
--       hold_credit, release_credit, increase_credit,
--       can_use_customer_capital_allocation, hold_capital_allocation
--
--   NOT rewritten, each for a stated reason:
--     tg_credit_derive_customer_person — this IS the derivation. Rewriting it
--       to read the person column would make it derive a value from itself.
--     calculate_credit_score, recalculate_settlement_score — these read
--       business documents (invoices, sales_quotes) by customer_id and upsert
--       the profile through ON CONFLICT (customer_id). Reading a customer's
--       invoices is not identity resolution against a credit table, and the
--       upsert needs the customer_id unique index as its arbiter.
--     compute_customer_capital_allocations, run_daily_capital_allocation,
--       save_customer_capital_allocations, recompute_dynamic_capital_setting,
--       recompute_customer_credit_scores — batch machinery that ENUMERATES the
--       customer set and joins on customers.id. They never resolve "who is this
--       party"; with the 1:1 guarantee the sets they produce are identical
--       either way. Rewriting them would be churn across large bodies of
--       allocation arithmetic — exactly the code where an accidental edit costs
--       real money — for zero behavioural gain.
--     list_trusted_credit_customers, calculate_customer_realtime_credit — these
--       already start FROM customers and join credit tables on c.id, so the
--       customer row IS the identity they resolved; there is no second lookup
--       to redirect.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1/8 — _ensure_credit_balance
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ensure_credit_balance(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _person_id uuid;
BEGIN
  SELECT person_id INTO _person_id FROM public.customers WHERE id = p_customer_id;
  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا به شخصی متصل نیست.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.customer_credit_balance (customer_id, available_credit, held_credit)
  VALUES (
    p_customer_id,
    COALESCE((SELECT credit_limit FROM public.customer_credit_profile WHERE customer_person_id = _person_id LIMIT 1), 0),
    0
  )
  ON CONFLICT (customer_id) DO NOTHING;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 2/8 — get_customer_credit
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_credit(p_customer_id uuid)
RETURNS TABLE(available_credit numeric, held_credit numeric, total_purchases numeric, outstanding_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _person_id uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT person_id INTO _person_id FROM public.customers WHERE id = p_customer_id;
  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا به شخصی متصل نیست.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  RETURN QUERY
  SELECT
    b.available_credit,
    b.held_credit,
    COALESCE(p.total_purchases, 0)::numeric,
    COALESCE(p.outstanding_balance, 0)::numeric
  FROM public.customer_credit_balance b
  LEFT JOIN public.customer_credit_profile p ON p.customer_person_id = b.customer_person_id
  WHERE b.customer_person_id = _person_id;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 3/8 — get_customer_dynamic_credit
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_dynamic_credit(p_customer_id uuid)
RETURNS TABLE(available_credit numeric, held_credit numeric, total_purchases numeric, outstanding_balance numeric, settlement_score integer, has_overdue boolean, overdue_since date, final_limit numeric, capital_date date, binding_constraint text, has_allocation boolean, is_today boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_final_limit numeric := 0;
  v_capital_date date;
  v_binding text;
  v_has_alloc boolean := false;
  v_is_today boolean := false;
  v_held numeric := 0;
  v_outstanding numeric := 0;
  v_total_purchases numeric := 0;
  v_settlement_score integer := 0;
  v_has_overdue boolean := false;
  v_overdue_since date;
  _person_id uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text, 'sales'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT person_id INTO _person_id FROM public.customers WHERE id = p_customer_id;
  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا به شخصی متصل نیست.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  -- Latest dynamic allocation (any date, newest first)
  SELECT a.final_limit, s.capital_date, a.binding_constraint
    INTO v_final_limit, v_capital_date, v_binding
  FROM public.customer_capital_allocations_dynamic a
  JOIN public.daily_capital_settings s ON s.id = a.capital_setting_id
  WHERE a.customer_person_id = _person_id
  ORDER BY s.capital_date DESC, a.created_at DESC
  LIMIT 1;

  IF v_final_limit IS NOT NULL THEN
    v_has_alloc := true;
    v_is_today := (v_capital_date = CURRENT_DATE);
  ELSE
    v_final_limit := 0;
  END IF;

  SELECT COALESCE(b.held_credit, 0) INTO v_held
  FROM public.customer_credit_balance b
  WHERE b.customer_person_id = _person_id;

  SELECT
    COALESCE(p.outstanding_balance, 0),
    COALESCE(p.total_purchases, 0),
    COALESCE(p.settlement_score, 0),
    COALESCE(p.has_overdue, false),
    p.overdue_since
  INTO v_outstanding, v_total_purchases, v_settlement_score, v_has_overdue, v_overdue_since
  FROM public.customer_credit_profile p
  WHERE p.customer_person_id = _person_id;

  RETURN QUERY SELECT
    GREATEST(v_final_limit - COALESCE(v_outstanding, 0) - COALESCE(v_held, 0), 0)::numeric AS available_credit,
    COALESCE(v_held, 0)::numeric AS held_credit,
    COALESCE(v_total_purchases, 0)::numeric AS total_purchases,
    COALESCE(v_outstanding, 0)::numeric AS outstanding_balance,
    COALESCE(v_settlement_score, 0)::integer AS settlement_score,
    COALESCE(v_has_overdue, false)::boolean AS has_overdue,
    v_overdue_since AS overdue_since,
    COALESCE(v_final_limit, 0)::numeric AS final_limit,
    v_capital_date AS capital_date,
    COALESCE(v_binding, '')::text AS binding_constraint,
    v_has_alloc AS has_allocation,
    v_is_today AS is_today;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 4/8 — hold_credit
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hold_credit(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
  v_new_held numeric;
  _person_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'sales'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT person_id INTO _person_id FROM public.customers WHERE id = p_customer_id;
  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا به شخصی متصل نیست.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_person_id = _person_id
   FOR UPDATE;

  IF v_available < p_amount THEN
    RAISE EXCEPTION 'اعتبار کافی نیست (موجودی: %، درخواست: %)', v_available, p_amount;
  END IF;

  v_new_available := v_available - p_amount;
  v_new_held := v_held + p_amount;

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         held_credit = v_new_held,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_person_id = _person_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
  VALUES
    (p_customer_id, 'hold', -p_amount, v_available, v_new_available, 'invoice', p_invoice_id, 'مسدودسازی اعتبار برای پیش‌فاکتور', p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'credit_hold',
    'customer',
    p_customer_id::text,
    jsonb_build_object('amount', p_amount, 'invoice_id', p_invoice_id, 'balance_before', v_available, 'balance_after', v_new_available)
  );
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5/8 — release_credit
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_credit(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
  v_new_held numeric;
  _person_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'sales'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT person_id INTO _person_id FROM public.customers WHERE id = p_customer_id;
  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا به شخصی متصل نیست.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_person_id = _person_id
   FOR UPDATE;

  v_new_available := v_available + p_amount;
  v_new_held := GREATEST(v_held - p_amount, 0);

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         held_credit = v_new_held,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_person_id = _person_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
  VALUES
    (p_customer_id, 'release', p_amount, v_available, v_new_available, 'invoice', p_invoice_id, 'آزادسازی اعتبار از پیش‌فاکتور', p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'credit_release',
    'customer',
    p_customer_id::text,
    jsonb_build_object('amount', p_amount, 'invoice_id', p_invoice_id, 'balance_before', v_available, 'balance_after', v_new_available)
  );
END;
$function$;

-- -----------------------------------------------------------------------------
-- 6/8 — increase_credit
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increase_credit(p_customer_id uuid, p_amount numeric, p_receipt_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
  _person_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text, 'accountant'::text]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای افزایش اعتبار';
  END IF;

  SELECT person_id INTO _person_id FROM public.customers WHERE id = p_customer_id;
  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا به شخصی متصل نیست.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_person_id = _person_id
   FOR UPDATE;

  v_new_available := v_available + p_amount;

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_person_id = _person_id;

  INSERT INTO public.customer_credit_ledger
    (customer_id, transaction_type, amount, balance_before, balance_after, reference_type, reference_id, description, created_by)
  VALUES
    (p_customer_id, 'payment', p_amount, v_available, v_new_available, 'receipt', p_receipt_id, 'افزایش اعتبار با تأیید فیش واریزی', p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
  VALUES (
    COALESCE(p_user_id, auth.uid()),
    'credit_payment',
    'customer',
    p_customer_id::text,
    jsonb_build_object('amount', p_amount, 'receipt_id', p_receipt_id, 'balance_before', v_available, 'balance_after', v_new_available)
  );
END;
$function$;

-- -----------------------------------------------------------------------------
-- 7/8 — can_use_customer_capital_allocation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_use_customer_capital_allocation(p_customer_id uuid, p_amount numeric)
RETURNS TABLE(can_use boolean, available numeric, customer_allocation_id uuid, salesperson_allocation_id uuid, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _snap uuid; _cca record; _sca record;
  _c_held numeric; _c_cons numeric; _s_held numeric; _s_cons numeric;
  _c_avail numeric; _s_avail numeric;
  _person_id uuid;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT person_id INTO _person_id FROM public.customers WHERE id = p_customer_id;
  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا به شخصی متصل نیست.' USING ERRCODE = 'P0002';
  END IF;

  _snap := public._latest_active_capital_setting();
  IF _snap IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid, NULL::uuid, 'هیچ snapshot سرمایه فعال وجود ندارد'::text;
    RETURN;
  END IF;

  SELECT id, salesperson_id, final_limit
    INTO _cca
    FROM public.customer_capital_allocations_dynamic
   WHERE capital_setting_id = _snap AND customer_person_id = _person_id;
  IF _cca.id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid, NULL::uuid, 'مشتری در snapshot فعال تخصیص ندارد'::text;
    RETURN;
  END IF;
  IF _cca.salesperson_id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, _cca.id, NULL::uuid, 'کارشناس فروش برای مشتری تعیین نشده'::text;
    RETURN;
  END IF;

  SELECT id, allocated_capital INTO _sca
    FROM public.salesperson_capital_allocations_dynamic
   WHERE capital_setting_id = _snap AND salesperson_id = _cca.salesperson_id;
  IF _sca.id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, _cca.id, NULL::uuid, 'کارشناس در snapshot فعال تخصیص ندارد'::text;
    RETURN;
  END IF;

  SELECT held, consumed INTO _c_held, _c_cons FROM public._capital_alloc_used('customer', _cca.id);
  SELECT held, consumed INTO _s_held, _s_cons FROM public._capital_alloc_used('salesperson', _sca.id);
  _c_avail := COALESCE(_cca.final_limit,0) - _c_held - _c_cons;
  _s_avail := COALESCE(_sca.allocated_capital,0) - _s_held - _s_cons;

  IF p_amount > _c_avail OR p_amount > _s_avail THEN
    RETURN QUERY SELECT false, LEAST(_c_avail,_s_avail), _cca.id, _sca.id,
      ('سهم سرمایه کافی نیست (مشتری: '||_c_avail||'، فروشنده: '||_s_avail||')')::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, LEAST(_c_avail,_s_avail), _cca.id, _sca.id, 'ok'::text;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 8/8 — hold_capital_allocation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hold_capital_allocation(p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _snap uuid; _cca record; _sca record;
  _c_held numeric; _c_cons numeric; _s_held numeric; _s_cons numeric;
  _c_avail numeric; _s_avail numeric;
  _person_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد'; END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT person_id INTO _person_id FROM public.customers WHERE id = p_customer_id;
  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا به شخصی متصل نیست.' USING ERRCODE = 'P0002';
  END IF;

  _snap := public._latest_active_capital_setting();
  IF _snap IS NULL THEN RAISE EXCEPTION 'هیچ snapshot سرمایه فعال وجود ندارد'; END IF;

  SELECT id, salesperson_id, final_limit INTO _cca
    FROM public.customer_capital_allocations_dynamic
   WHERE capital_setting_id = _snap AND customer_person_id = _person_id
   FOR UPDATE;
  IF _cca.id IS NULL THEN RAISE EXCEPTION 'مشتری در snapshot فعال تخصیص ندارد'; END IF;
  IF _cca.salesperson_id IS NULL THEN RAISE EXCEPTION 'کارشناس فروش برای مشتری تعیین نشده'; END IF;

  SELECT id, allocated_capital INTO _sca
    FROM public.salesperson_capital_allocations_dynamic
   WHERE capital_setting_id = _snap AND salesperson_id = _cca.salesperson_id
   FOR UPDATE;
  IF _sca.id IS NULL THEN RAISE EXCEPTION 'کارشناس در snapshot فعال تخصیص ندارد'; END IF;

  SELECT held, consumed INTO _c_held, _c_cons FROM public._capital_alloc_used('customer', _cca.id);
  SELECT held, consumed INTO _s_held, _s_cons FROM public._capital_alloc_used('salesperson', _sca.id);
  _c_avail := COALESCE(_cca.final_limit,0) - _c_held - _c_cons;
  _s_avail := COALESCE(_sca.allocated_capital,0) - _s_held - _s_cons;
  IF p_amount > _c_avail THEN RAISE EXCEPTION 'سهم سرمایه مشتری کافی نیست (مانده: %)', _c_avail; END IF;
  IF p_amount > _s_avail THEN RAISE EXCEPTION 'سهم سرمایه فروشنده کافی نیست (مانده: %)', _s_avail; END IF;

  INSERT INTO public.capital_allocation_ledger
    (allocation_kind, allocation_id, transaction_type, amount,
     held_before, held_after, consumed_before, consumed_after,
     reference_type, reference_id, actor_id, metadata)
  VALUES ('customer', _cca.id, 'hold', p_amount,
          _c_held, _c_held + p_amount, _c_cons, _c_cons,
          'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()),
          jsonb_build_object('customer_id', p_customer_id, 'setting_id', _snap));

  INSERT INTO public.capital_allocation_ledger
    (allocation_kind, allocation_id, transaction_type, amount,
     held_before, held_after, consumed_before, consumed_after,
     reference_type, reference_id, actor_id, metadata)
  VALUES ('salesperson', _sca.id, 'hold', p_amount,
          _s_held, _s_held + p_amount, _s_cons, _s_cons,
          'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()),
          jsonb_build_object('salesperson_id', _cca.salesperson_id, 'setting_id', _snap, 'customer_allocation_id', _cca.id));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()), 'capital_allocation_hold', 'invoice', p_invoice_id::text,
          jsonb_build_object('amount', p_amount, 'customer_allocation_id', _cca.id, 'salesperson_allocation_id', _sca.id));
END;
$function$;

COMMENT ON FUNCTION public.get_customer_credit(uuid) IS
  'Phase 8.6 (243). Resolves the party through customers.person_id and reads the credit tables by customer_person_id. Safe only because migration 240 made customers.person_id UNIQUE - keying credit on a person before that would have summed two customers sharing one person, which is exactly why migration 237 refused. No threshold, weight, formula or rounding was changed; numeric parity was proven against the pre-243 outputs for all 12 customers.';

NOTIFY pgrst, 'reload schema';
