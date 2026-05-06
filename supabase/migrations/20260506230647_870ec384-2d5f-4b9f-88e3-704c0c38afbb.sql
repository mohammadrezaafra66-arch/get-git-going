-- Phase 22.2B — Capital allocation consumption ledger (backend only)
-- Per H decisions: archive on new active snapshot, consume at posted, hold for both
-- pre_invoice & advance_payment(commitment), block when salesperson has no allocation,
-- single active snapshot, held+consumed columns, ledger table.
-- InvoiceForm integration is a separate small step (22.2C).

-- ===== A. Schema additions =====
ALTER TABLE public.daily_capital_snapshots
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dcs_active_singleton
  ON public.daily_capital_snapshots(is_active) WHERE is_active;

ALTER TABLE public.customer_capital_allocations
  ADD COLUMN IF NOT EXISTS held_amount numeric NOT NULL DEFAULT 0 CHECK (held_amount >= 0),
  ADD COLUMN IF NOT EXISTS consumed_amount numeric NOT NULL DEFAULT 0 CHECK (consumed_amount >= 0);

ALTER TABLE public.salesperson_capital_allocations
  ADD COLUMN IF NOT EXISTS held_amount numeric NOT NULL DEFAULT 0 CHECK (held_amount >= 0),
  ADD COLUMN IF NOT EXISTS consumed_amount numeric NOT NULL DEFAULT 0 CHECK (consumed_amount >= 0);

-- Cross-column validation trigger (CHECK can't reference final_amount safely w/ updates)
CREATE OR REPLACE FUNCTION public._validate_allocation_amounts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.held_amount + NEW.consumed_amount > NEW.final_amount THEN
    RAISE EXCEPTION 'held_amount(%) + consumed_amount(%) از final_amount(%) بیشتر است',
      NEW.held_amount, NEW.consumed_amount, NEW.final_amount;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_cca_amounts ON public.customer_capital_allocations;
CREATE TRIGGER trg_validate_cca_amounts
  BEFORE INSERT OR UPDATE OF held_amount, consumed_amount, final_amount
  ON public.customer_capital_allocations
  FOR EACH ROW EXECUTE FUNCTION public._validate_allocation_amounts();

DROP TRIGGER IF EXISTS trg_validate_sca_amounts ON public.salesperson_capital_allocations;
CREATE TRIGGER trg_validate_sca_amounts
  BEFORE INSERT OR UPDATE OF held_amount, consumed_amount, final_amount
  ON public.salesperson_capital_allocations
  FOR EACH ROW EXECUTE FUNCTION public._validate_allocation_amounts();

-- ===== B. Ledger table =====
CREATE TABLE IF NOT EXISTS public.capital_allocation_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_kind text NOT NULL CHECK (allocation_kind IN ('customer','salesperson')),
  allocation_id uuid NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('hold','release','consume','refund')),
  amount numeric NOT NULL,
  held_before numeric NOT NULL,
  held_after numeric NOT NULL,
  consumed_before numeric NOT NULL,
  consumed_after numeric NOT NULL,
  reference_type text,
  reference_id uuid,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cal_alloc ON public.capital_allocation_ledger(allocation_kind, allocation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_cal_ref ON public.capital_allocation_ledger(reference_type, reference_id);

ALTER TABLE public.capital_allocation_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cal_select_admin ON public.capital_allocation_ledger;
CREATE POLICY cal_select_admin ON public.capital_allocation_ledger
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]));

DROP POLICY IF EXISTS cal_select_sales ON public.capital_allocation_ledger;
CREATE POLICY cal_select_sales ON public.capital_allocation_ledger
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'sales'::app_role)
    AND (
      (allocation_kind='salesperson' AND allocation_id IN (
        SELECT id FROM public.salesperson_capital_allocations WHERE salesperson_id = auth.uid()
      ))
      OR (allocation_kind='customer' AND allocation_id IN (
        SELECT id FROM public.customer_capital_allocations WHERE salesperson_id = auth.uid()
      ))
    )
  );
-- No INSERT/UPDATE/DELETE policy → only SECURITY DEFINER RPCs can write.

-- ===== C. Archive trigger: when a snapshot becomes active, archive prior allocations =====
CREATE OR REPLACE FUNCTION public._archive_prior_allocations_on_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_active = true AND (TG_OP='INSERT' OR OLD.is_active = false) THEN
    UPDATE public.customer_capital_allocations
       SET status = 'archived', updated_at = now()
     WHERE capital_snapshot_id <> NEW.id AND status NOT IN ('archived');
    UPDATE public.salesperson_capital_allocations
       SET status = 'archived', updated_at = now()
     WHERE capital_snapshot_id <> NEW.id AND status NOT IN ('archived');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_prior_allocations ON public.daily_capital_snapshots;
CREATE TRIGGER trg_archive_prior_allocations
  AFTER INSERT OR UPDATE OF is_active ON public.daily_capital_snapshots
  FOR EACH ROW EXECUTE FUNCTION public._archive_prior_allocations_on_active();

-- ===== D. RPCs =====

-- D.1 read-only pre-flight
CREATE OR REPLACE FUNCTION public.can_use_customer_capital_allocation(
  p_customer_id uuid, p_amount numeric
) RETURNS TABLE(
  can_use boolean,
  available numeric,
  customer_allocation_id uuid,
  salesperson_allocation_id uuid,
  reason text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _snap uuid;
  _cca record;
  _sca record;
  _c_avail numeric;
  _s_avail numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT id INTO _snap FROM public.daily_capital_snapshots WHERE is_active = true;
  IF _snap IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid, NULL::uuid, 'هیچ snapshot سرمایه فعال وجود ندارد'::text;
    RETURN;
  END IF;

  SELECT * INTO _cca FROM public.customer_capital_allocations
   WHERE customer_id = p_customer_id AND capital_snapshot_id = _snap AND status = 'approved';
  IF _cca.id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, NULL::uuid, NULL::uuid, 'مشتری در snapshot فعال تخصیص تأییدشده ندارد'::text;
    RETURN;
  END IF;

  SELECT * INTO _sca FROM public.salesperson_capital_allocations
   WHERE id = _cca.salesperson_allocation_id AND status = 'approved';
  IF _sca.id IS NULL THEN
    RETURN QUERY SELECT false, 0::numeric, _cca.id, NULL::uuid, 'فروشنده تخصیص تأییدشده ندارد'::text;
    RETURN;
  END IF;

  _c_avail := _cca.final_amount - _cca.held_amount - _cca.consumed_amount;
  _s_avail := _sca.final_amount - _sca.held_amount - _sca.consumed_amount;

  IF p_amount > _c_avail OR p_amount > _s_avail THEN
    RETURN QUERY SELECT false, LEAST(_c_avail,_s_avail), _cca.id, _sca.id,
      ('سهم سرمایه کافی نیست (مشتری: '||_c_avail||'، فروشنده: '||_s_avail||')')::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, LEAST(_c_avail,_s_avail), _cca.id, _sca.id, 'ok'::text;
END;
$$;

-- D.2 hold (atomic customer + salesperson)
CREATE OR REPLACE FUNCTION public.hold_capital_allocation(
  p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _snap uuid;
  _cca record;
  _sca record;
  _c_avail numeric;
  _s_avail numeric;
  _c_held_before numeric;
  _s_held_before numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد'; END IF;
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'sales'::app_role,'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  SELECT id INTO _snap FROM public.daily_capital_snapshots WHERE is_active = true;
  IF _snap IS NULL THEN RAISE EXCEPTION 'هیچ snapshot سرمایه فعال وجود ندارد'; END IF;

  SELECT * INTO _cca FROM public.customer_capital_allocations
   WHERE customer_id = p_customer_id AND capital_snapshot_id = _snap AND status='approved'
   FOR UPDATE;
  IF _cca.id IS NULL THEN RAISE EXCEPTION 'مشتری در snapshot فعال تخصیص تأییدشده ندارد'; END IF;

  SELECT * INTO _sca FROM public.salesperson_capital_allocations
   WHERE id = _cca.salesperson_allocation_id AND status='approved'
   FOR UPDATE;
  IF _sca.id IS NULL THEN RAISE EXCEPTION 'فروشنده تخصیص تأییدشده ندارد'; END IF;

  _c_avail := _cca.final_amount - _cca.held_amount - _cca.consumed_amount;
  _s_avail := _sca.final_amount - _sca.held_amount - _sca.consumed_amount;
  IF p_amount > _c_avail THEN RAISE EXCEPTION 'سهم سرمایه مشتری کافی نیست (مانده: %)', _c_avail; END IF;
  IF p_amount > _s_avail THEN RAISE EXCEPTION 'سهم سرمایه فروشنده کافی نیست (مانده: %)', _s_avail; END IF;

  _c_held_before := _cca.held_amount;
  _s_held_before := _sca.held_amount;

  UPDATE public.customer_capital_allocations
     SET held_amount = held_amount + p_amount, updated_at = now()
   WHERE id = _cca.id;
  INSERT INTO public.capital_allocation_ledger
    (allocation_kind, allocation_id, transaction_type, amount,
     held_before, held_after, consumed_before, consumed_after,
     reference_type, reference_id, actor_id, metadata)
  VALUES ('customer', _cca.id, 'hold', p_amount,
          _c_held_before, _c_held_before + p_amount, _cca.consumed_amount, _cca.consumed_amount,
          'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()),
          jsonb_build_object('customer_id', p_customer_id, 'snapshot_id', _snap));

  UPDATE public.salesperson_capital_allocations
     SET held_amount = held_amount + p_amount, updated_at = now()
   WHERE id = _sca.id;
  INSERT INTO public.capital_allocation_ledger
    (allocation_kind, allocation_id, transaction_type, amount,
     held_before, held_after, consumed_before, consumed_after,
     reference_type, reference_id, actor_id, metadata)
  VALUES ('salesperson', _sca.id, 'hold', p_amount,
          _s_held_before, _s_held_before + p_amount, _sca.consumed_amount, _sca.consumed_amount,
          'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()),
          jsonb_build_object('salesperson_id', _sca.salesperson_id, 'snapshot_id', _snap, 'customer_allocation_id', _cca.id));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()), 'capital_allocation_hold', 'invoice', p_invoice_id::text,
          jsonb_build_object('amount', p_amount, 'customer_allocation_id', _cca.id, 'salesperson_allocation_id', _sca.id));
END;
$$;

-- D.3 release (locate held entries via ledger by reference_id)
CREATE OR REPLACE FUNCTION public.release_capital_allocation(
  p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cca_id uuid; _sca_id uuid;
  _c_held numeric; _s_held numeric;
  _c_consumed numeric; _s_consumed numeric;
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

  SELECT held_amount, consumed_amount INTO _c_held, _c_consumed FROM public.customer_capital_allocations WHERE id=_cca_id FOR UPDATE;
  SELECT held_amount, consumed_amount INTO _s_held, _s_consumed FROM public.salesperson_capital_allocations WHERE id=_sca_id FOR UPDATE;
  IF p_amount > _c_held OR p_amount > _s_held THEN RAISE EXCEPTION 'مقدار release بیش از held است'; END IF;

  UPDATE public.customer_capital_allocations SET held_amount = held_amount - p_amount, updated_at=now() WHERE id=_cca_id;
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('customer', _cca_id, 'release', p_amount, _c_held, _c_held - p_amount, _c_consumed, _c_consumed, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  UPDATE public.salesperson_capital_allocations SET held_amount = held_amount - p_amount, updated_at=now() WHERE id=_sca_id;
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('salesperson', _sca_id, 'release', p_amount, _s_held, _s_held - p_amount, _s_consumed, _s_consumed, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()),'capital_allocation_release','invoice',p_invoice_id::text,
          jsonb_build_object('amount', p_amount));
END;
$$;

-- D.4 consume (held → consumed)
CREATE OR REPLACE FUNCTION public.consume_capital_allocation(
  p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cca_id uuid; _sca_id uuid;
  _c_held numeric; _s_held numeric;
  _c_consumed numeric; _s_consumed numeric;
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

  SELECT held_amount, consumed_amount INTO _c_held, _c_consumed FROM public.customer_capital_allocations WHERE id=_cca_id FOR UPDATE;
  SELECT held_amount, consumed_amount INTO _s_held, _s_consumed FROM public.salesperson_capital_allocations WHERE id=_sca_id FOR UPDATE;
  IF p_amount > _c_held OR p_amount > _s_held THEN RAISE EXCEPTION 'مقدار consume بیش از held است'; END IF;

  UPDATE public.customer_capital_allocations SET held_amount = held_amount - p_amount, consumed_amount = consumed_amount + p_amount, updated_at=now() WHERE id=_cca_id;
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('customer', _cca_id, 'consume', p_amount, _c_held, _c_held - p_amount, _c_consumed, _c_consumed + p_amount, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  UPDATE public.salesperson_capital_allocations SET held_amount = held_amount - p_amount, consumed_amount = consumed_amount + p_amount, updated_at=now() WHERE id=_sca_id;
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('salesperson', _sca_id, 'consume', p_amount, _s_held, _s_held - p_amount, _s_consumed, _s_consumed + p_amount, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()),'capital_allocation_consume','invoice',p_invoice_id::text,
          jsonb_build_object('amount', p_amount));
END;
$$;

-- D.5 refund (reverse a consumed amount)
CREATE OR REPLACE FUNCTION public.refund_capital_allocation(
  p_customer_id uuid, p_amount numeric, p_invoice_id uuid, p_user_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _cca_id uuid; _sca_id uuid;
  _c_held numeric; _s_held numeric;
  _c_consumed numeric; _s_consumed numeric;
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

  SELECT held_amount, consumed_amount INTO _c_held, _c_consumed FROM public.customer_capital_allocations WHERE id=_cca_id FOR UPDATE;
  SELECT held_amount, consumed_amount INTO _s_held, _s_consumed FROM public.salesperson_capital_allocations WHERE id=_sca_id FOR UPDATE;
  IF p_amount > _c_consumed OR p_amount > _s_consumed THEN RAISE EXCEPTION 'مقدار refund بیش از consumed است'; END IF;

  UPDATE public.customer_capital_allocations SET consumed_amount = consumed_amount - p_amount, updated_at=now() WHERE id=_cca_id;
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('customer', _cca_id, 'refund', p_amount, _c_held, _c_held, _c_consumed, _c_consumed - p_amount, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  UPDATE public.salesperson_capital_allocations SET consumed_amount = consumed_amount - p_amount, updated_at=now() WHERE id=_sca_id;
  INSERT INTO public.capital_allocation_ledger(allocation_kind, allocation_id, transaction_type, amount, held_before, held_after, consumed_before, consumed_after, reference_type, reference_id, actor_id)
  VALUES ('salesperson', _sca_id, 'refund', p_amount, _s_held, _s_held, _s_consumed, _s_consumed - p_amount, 'invoice', p_invoice_id, COALESCE(p_user_id, auth.uid()));

  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff)
  VALUES (COALESCE(p_user_id, auth.uid()),'capital_allocation_refund','invoice',p_invoice_id::text,
          jsonb_build_object('amount', p_amount));
END;
$$;

-- ===== E. Privileges =====
REVOKE ALL ON FUNCTION public.can_use_customer_capital_allocation(uuid,numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hold_capital_allocation(uuid,numeric,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_capital_allocation(uuid,numeric,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_capital_allocation(uuid,numeric,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.refund_capital_allocation(uuid,numeric,uuid,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_use_customer_capital_allocation(uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hold_capital_allocation(uuid,numeric,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_capital_allocation(uuid,numeric,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_capital_allocation(uuid,numeric,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_capital_allocation(uuid,numeric,uuid,uuid) TO authenticated;