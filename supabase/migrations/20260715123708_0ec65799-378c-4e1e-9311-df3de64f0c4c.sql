-- Migrate capital-allocation RPCs to the dynamic system.
-- Source of truth: daily_capital_settings + *_dynamic tables.
-- held/consumed are computed on-the-fly from capital_allocation_ledger
-- (dynamic tables intentionally have no held/consumed columns).

CREATE OR REPLACE FUNCTION public._latest_active_capital_setting()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.daily_capital_settings
   WHERE capital_date <= CURRENT_DATE
   ORDER BY capital_date DESC, created_at DESC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public._capital_alloc_used(
  p_kind text, p_alloc_id uuid, OUT held numeric, OUT consumed numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN transaction_type='hold' THEN amount
                      WHEN transaction_type='release' THEN -amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN transaction_type='consume' THEN amount
                      WHEN transaction_type='refund' THEN -amount ELSE 0 END), 0)
    INTO held, consumed
  FROM public.capital_allocation_ledger
  WHERE allocation_kind = p_kind AND allocation_id = p_alloc_id;
END;
$$;

-- D.1 pre-flight
CREATE OR REPLACE FUNCTION public.can_use_customer_capital_allocation(
  p_customer_id uuid, p_amount numeric
) RETURNS TABLE(
  can_use boolean, available numeric,
  customer_allocation_id uuid, salesperson_allocation_id uuid, reason text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _snap uuid; _cca record; _sca record;
  _c_held numeric; _c_cons numeric; _s_held numeric; _s_cons numeric;
  _c_avail numeric; _s_avail numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  _snap := public._latest_active_capital_setting();
  IF _snap IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid, NULL::uuid, 'هیچ snapshot سرمایه فعال وجود ندارد'::text;
    RETURN;
  END IF;

  SELECT id, salesperson_id, final_limit
    INTO _cca
    FROM public.customer_capital_allocations_dynamic
   WHERE capital_setting_id = _snap AND customer_id = p_customer_id;
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
$$;

-- D.2 hold
CREATE OR REPLACE FUNCTION public.hold_capital_allocation(
  p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _snap uuid; _cca record; _sca record;
  _c_held numeric; _c_cons numeric; _s_held numeric; _s_cons numeric;
  _c_avail numeric; _s_avail numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد'; END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  _snap := public._latest_active_capital_setting();
  IF _snap IS NULL THEN RAISE EXCEPTION 'هیچ snapshot سرمایه فعال وجود ندارد'; END IF;

  SELECT id, salesperson_id, final_limit INTO _cca
    FROM public.customer_capital_allocations_dynamic
   WHERE capital_setting_id = _snap AND customer_id = p_customer_id
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
$$;

-- D.3 release
CREATE OR REPLACE FUNCTION public.release_capital_allocation(
  p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cca_id uuid; _sca_id uuid;
  _c_held numeric; _c_cons numeric; _s_held numeric; _s_cons numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد'; END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT allocation_id INTO _cca_id FROM public.capital_allocation_ledger
   WHERE allocation_kind='customer' AND reference_type='invoice' AND reference_id=p_invoice_id AND transaction_type='hold'
   ORDER BY created_at DESC LIMIT 1;
  SELECT allocation_id INTO _sca_id FROM public.capital_allocation_ledger
   WHERE allocation_kind='salesperson' AND reference_type='invoice' AND reference_id=p_invoice_id AND transaction_type='hold'
   ORDER BY created_at DESC LIMIT 1;
  IF _cca_id IS NULL OR _sca_id IS NULL THEN RAISE EXCEPTION 'hold قبلی برای این فاکتور یافت نشد'; END IF;

  PERFORM 1 FROM public.customer_capital_allocations_dynamic WHERE id=_cca_id FOR UPDATE;
  PERFORM 1 FROM public.salesperson_capital_allocations_dynamic WHERE id=_sca_id FOR UPDATE;
  SELECT held, consumed INTO _c_held, _c_cons FROM public._capital_alloc_used('customer', _cca_id);
  SELECT held, consumed INTO _s_held, _s_cons FROM public._capital_alloc_used('salesperson', _sca_id);
  IF p_amount > _c_held OR p_amount > _s_held THEN RAISE EXCEPTION 'مقدار release بیش از held است'; END IF;

  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('customer', _cca_id, 'release', p_amount, _c_held, _c_held - p_amount, _c_cons, _c_cons, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('salesperson', _sca_id, 'release', p_amount, _s_held, _s_held - p_amount, _s_cons, _s_cons, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()),'capital_allocation_release','invoice',p_invoice_id::text,
          jsonb_build_object('amount', p_amount));
END;
$$;

-- D.4 consume
CREATE OR REPLACE FUNCTION public.consume_capital_allocation(
  p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cca_id uuid; _sca_id uuid;
  _c_held numeric; _c_cons numeric; _s_held numeric; _s_cons numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد'; END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT allocation_id INTO _cca_id FROM public.capital_allocation_ledger
   WHERE allocation_kind='customer' AND reference_type='invoice' AND reference_id=p_invoice_id AND transaction_type='hold'
   ORDER BY created_at DESC LIMIT 1;
  SELECT allocation_id INTO _sca_id FROM public.capital_allocation_ledger
   WHERE allocation_kind='salesperson' AND reference_type='invoice' AND reference_id=p_invoice_id AND transaction_type='hold'
   ORDER BY created_at DESC LIMIT 1;
  IF _cca_id IS NULL OR _sca_id IS NULL THEN RAISE EXCEPTION 'hold قبلی برای این فاکتور یافت نشد'; END IF;

  PERFORM 1 FROM public.customer_capital_allocations_dynamic WHERE id=_cca_id FOR UPDATE;
  PERFORM 1 FROM public.salesperson_capital_allocations_dynamic WHERE id=_sca_id FOR UPDATE;
  SELECT held, consumed INTO _c_held, _c_cons FROM public._capital_alloc_used('customer', _cca_id);
  SELECT held, consumed INTO _s_held, _s_cons FROM public._capital_alloc_used('salesperson', _sca_id);
  IF p_amount > _c_held OR p_amount > _s_held THEN RAISE EXCEPTION 'مقدار consume بیش از held است'; END IF;

  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('customer', _cca_id, 'consume', p_amount, _c_held, _c_held - p_amount, _c_cons, _c_cons + p_amount, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('salesperson', _sca_id, 'consume', p_amount, _s_held, _s_held - p_amount, _s_cons, _s_cons + p_amount, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()),'capital_allocation_consume','invoice',p_invoice_id::text,
          jsonb_build_object('amount', p_amount));
END;
$$;

-- D.5 refund
CREATE OR REPLACE FUNCTION public.refund_capital_allocation(
  p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cca_id uuid; _sca_id uuid;
  _c_held numeric; _c_cons numeric; _s_held numeric; _s_cons numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد'; END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT allocation_id INTO _cca_id FROM public.capital_allocation_ledger
   WHERE allocation_kind='customer' AND reference_type='invoice' AND reference_id=p_invoice_id AND transaction_type='consume'
   ORDER BY created_at DESC LIMIT 1;
  SELECT allocation_id INTO _sca_id FROM public.capital_allocation_ledger
   WHERE allocation_kind='salesperson' AND reference_type='invoice' AND reference_id=p_invoice_id AND transaction_type='consume'
   ORDER BY created_at DESC LIMIT 1;
  IF _cca_id IS NULL OR _sca_id IS NULL THEN RAISE EXCEPTION 'consume قبلی برای این فاکتور یافت نشد'; END IF;

  PERFORM 1 FROM public.customer_capital_allocations_dynamic WHERE id=_cca_id FOR UPDATE;
  PERFORM 1 FROM public.salesperson_capital_allocations_dynamic WHERE id=_sca_id FOR UPDATE;
  SELECT held, consumed INTO _c_held, _c_cons FROM public._capital_alloc_used('customer', _cca_id);
  SELECT held, consumed INTO _s_held, _s_cons FROM public._capital_alloc_used('salesperson', _sca_id);
  IF p_amount > _c_cons OR p_amount > _s_cons THEN RAISE EXCEPTION 'مقدار refund بیش از consumed است'; END IF;

  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('customer', _cca_id, 'refund', p_amount, _c_held, _c_held, _c_cons, _c_cons - p_amount, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('salesperson', _sca_id, 'refund', p_amount, _s_held, _s_held, _s_cons, _s_cons - p_amount, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()),'capital_allocation_refund','invoice',p_invoice_id::text,
          jsonb_build_object('amount', p_amount));
END;
$$;

REVOKE ALL ON FUNCTION public._latest_active_capital_setting() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._capital_alloc_used(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._latest_active_capital_setting() TO authenticated;
GRANT EXECUTE ON FUNCTION public._capital_alloc_used(text, uuid) TO authenticated;
