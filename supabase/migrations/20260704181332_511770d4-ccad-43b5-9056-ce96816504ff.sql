ALTER TABLE public.settlement_types
  ADD COLUMN IF NOT EXISTS days integer NOT NULL DEFAULT 0 CHECK (days >= 0);

ALTER TABLE public.sale_price_types
  ADD COLUMN IF NOT EXISTS max_settlement_days integer NOT NULL DEFAULT 0 CHECK (max_settlement_days >= 0);

CREATE OR REPLACE FUNCTION public.validate_price_settlement_compatibility(
  p_sale_price_type_id uuid,
  p_settlement_type_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_price_max_days integer;
  v_settlement_days integer;
  v_price_title text;
  v_settlement_title text;
BEGIN
  SELECT max_settlement_days, title INTO v_price_max_days, v_price_title
  FROM sale_price_types WHERE id = p_sale_price_type_id;

  SELECT days, title INTO v_settlement_days, v_settlement_title
  FROM settlement_types WHERE id = p_settlement_type_id;

  IF v_price_max_days IS NULL OR v_settlement_days IS NULL THEN
    RETURN jsonb_build_object('valid', true, 'reason', 'not_configured');
  END IF;

  IF v_settlement_days > v_price_max_days THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', 'settlement_too_long',
      'message', 'قیمت «' || v_price_title || '» حداکثر ' || v_price_max_days || ' روز تسویه دارد. نمی‌توان با تسویه «' || v_settlement_title || '» (' || v_settlement_days || ' روز) فاکتور زد.'
    );
  END IF;

  RETURN jsonb_build_object('valid', true, 'price_max_days', v_price_max_days, 'settlement_days', v_settlement_days);
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_price_settlement_compatibility(uuid, uuid) TO authenticated;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS settlement_days integer,
  ADD COLUMN IF NOT EXISTS settlement_due_date date;

CREATE OR REPLACE FUNCTION public.set_invoice_settlement_due_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.settlement_type_id IS NOT NULL THEN
    SELECT days INTO NEW.settlement_days
    FROM settlement_types WHERE id = NEW.settlement_type_id;
    NEW.settlement_due_date := (CURRENT_DATE + COALESCE(NEW.settlement_days, 0))::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_settlement_due ON public.invoices;
CREATE TRIGGER trg_invoice_settlement_due
  BEFORE INSERT OR UPDATE OF settlement_type_id ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_settlement_due_date();