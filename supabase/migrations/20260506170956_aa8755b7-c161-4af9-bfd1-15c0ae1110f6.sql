
DROP POLICY IF EXISTS "accountant can mark purchase paid" ON public.purchases;
CREATE POLICY "accountant can mark purchase paid"
  ON public.purchases
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'accountant'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'accountant'::app_role));

CREATE OR REPLACE FUNCTION public.guard_accountant_purchase_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin/manager bypass guard
  IF public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'accountant'::app_role) THEN
    -- Accountant may only set paid_at/paid_by; everything else must remain unchanged
    IF NEW.product_id      IS DISTINCT FROM OLD.product_id      OR
       NEW.supplier_id     IS DISTINCT FROM OLD.supplier_id     OR
       NEW.payment_term_id IS DISTINCT FROM OLD.payment_term_id OR
       NEW.purchase_price  IS DISTINCT FROM OLD.purchase_price  OR
       NEW.cash_price      IS DISTINCT FROM OLD.cash_price      OR
       NEW.cash_price_currency IS DISTINCT FROM OLD.cash_price_currency OR
       NEW.currency        IS DISTINCT FROM OLD.currency        OR
       NEW.quantity        IS DISTINCT FROM OLD.quantity        OR
       NEW.purchase_date   IS DISTINCT FROM OLD.purchase_date   OR
       NEW.total_amount    IS DISTINCT FROM OLD.total_amount    OR
       NEW.notes           IS DISTINCT FROM OLD.notes           OR
       NEW.status          IS DISTINCT FROM OLD.status          OR
       NEW.created_by      IS DISTINCT FROM OLD.created_by      OR
       NEW.number          IS DISTINCT FROM OLD.number
    THEN
      RAISE EXCEPTION 'حسابدار فقط مجاز به ثبت زمان پرداخت است';
    END IF;

    IF NEW.paid_at IS NOT NULL AND NEW.paid_by IS NULL THEN
      NEW.paid_by := auth.uid();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_accountant_purchase_update ON public.purchases;
CREATE TRIGGER trg_guard_accountant_purchase_update
BEFORE UPDATE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION public.guard_accountant_purchase_update();
