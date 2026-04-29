
-- ============================================================
-- F-8: Customer Credit Ledger & Real-time Balance
-- ============================================================

-- 1) Ledger table
CREATE TABLE IF NOT EXISTS public.customer_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  transaction_type text NOT NULL CHECK (transaction_type IN ('hold','release','charge','payment','adjustment')),
  amount numeric(15,2) NOT NULL,
  balance_before numeric(15,2) NOT NULL,
  balance_after numeric(15,2) NOT NULL,
  reference_type text,
  reference_id uuid,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_customer_id_idx ON public.customer_credit_ledger(customer_id);
CREATE INDEX IF NOT EXISTS ledger_reference_idx ON public.customer_credit_ledger(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS ledger_created_at_idx ON public.customer_credit_ledger(created_at DESC);

ALTER TABLE public.customer_credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ccl_read_privileged ON public.customer_credit_ledger;
CREATE POLICY ccl_read_privileged ON public.customer_credit_ledger
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

-- No direct INSERT/UPDATE/DELETE policies: only SECURITY DEFINER functions can write.

-- 2) Balance table
CREATE TABLE IF NOT EXISTS public.customer_credit_balance (
  customer_id uuid PRIMARY KEY REFERENCES public.customers(id) ON DELETE CASCADE,
  available_credit numeric(15,2) NOT NULL DEFAULT 0,
  held_credit numeric(15,2) NOT NULL DEFAULT 0,
  last_transaction_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_credit_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ccb_read_privileged ON public.customer_credit_balance;
CREATE POLICY ccb_read_privileged ON public.customer_credit_balance
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

DROP POLICY IF EXISTS ccb_write_admin_accountant ON public.customer_credit_balance;
CREATE POLICY ccb_write_admin_accountant ON public.customer_credit_balance
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));

-- 3) Helper: ensure balance row exists, returns customer_id
CREATE OR REPLACE FUNCTION public._ensure_credit_balance(p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.customer_credit_balance (customer_id, available_credit, held_credit)
  VALUES (
    p_customer_id,
    COALESCE((SELECT credit_limit FROM public.customer_credit_profile WHERE customer_id = p_customer_id LIMIT 1), 0),
    0
  )
  ON CONFLICT (customer_id) DO NOTHING;
END;
$$;

-- 4) hold_credit
CREATE OR REPLACE FUNCTION public.hold_credit(
  p_customer_id uuid,
  p_amount numeric,
  p_invoice_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
  v_new_held numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_id = p_customer_id
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
   WHERE customer_id = p_customer_id;

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
$$;

-- 5) release_credit
CREATE OR REPLACE FUNCTION public.release_credit(
  p_customer_id uuid,
  p_amount numeric,
  p_invoice_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
  v_new_held numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'sales'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_id = p_customer_id
   FOR UPDATE;

  v_new_available := v_available + p_amount;
  v_new_held := GREATEST(v_held - p_amount, 0);

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         held_credit = v_new_held,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_id = p_customer_id;

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
$$;

-- 6) increase_credit (payment receipt confirmed)
CREATE OR REPLACE FUNCTION public.increase_credit(
  p_customer_id uuid,
  p_amount numeric,
  p_receipt_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available numeric;
  v_held numeric;
  v_new_available numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ باید بزرگتر از صفر باشد';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز برای افزایش اعتبار';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  SELECT available_credit, held_credit
    INTO v_available, v_held
    FROM public.customer_credit_balance
   WHERE customer_id = p_customer_id
   FOR UPDATE;

  v_new_available := v_available + p_amount;

  UPDATE public.customer_credit_balance
     SET available_credit = v_new_available,
         last_transaction_at = now(),
         updated_at = now()
   WHERE customer_id = p_customer_id;

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
$$;

-- 7) get_customer_credit
CREATE OR REPLACE FUNCTION public.get_customer_credit(p_customer_id uuid)
RETURNS TABLE(
  available_credit numeric,
  held_credit numeric,
  total_purchases numeric,
  outstanding_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role, 'sales'::app_role]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز';
  END IF;

  PERFORM public._ensure_credit_balance(p_customer_id);

  RETURN QUERY
  SELECT
    b.available_credit,
    b.held_credit,
    COALESCE(p.total_purchases, 0)::numeric,
    COALESCE(p.outstanding_balance, 0)::numeric
  FROM public.customer_credit_balance b
  LEFT JOIN public.customer_credit_profile p ON p.customer_id = b.customer_id
  WHERE b.customer_id = p_customer_id;
END;
$$;

-- 8) Grants
GRANT EXECUTE ON FUNCTION public.hold_credit(uuid, numeric, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_credit(uuid, numeric, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increase_credit(uuid, numeric, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_credit(uuid) TO authenticated;
