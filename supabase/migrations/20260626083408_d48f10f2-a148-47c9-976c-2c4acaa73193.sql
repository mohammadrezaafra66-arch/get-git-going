CREATE OR REPLACE FUNCTION public.trg_invoice_settlement_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.actual_settlement_date IS DISTINCT FROM OLD.actual_settlement_date
     AND NEW.customer_id IS NOT NULL THEN
    PERFORM public.recalculate_settlement_score(NEW.customer_id);
    PERFORM public.update_customer_overdue_status(NEW.customer_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_settlement ON public.invoices;
CREATE TRIGGER trg_invoice_settlement
  AFTER UPDATE OF actual_settlement_date ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_invoice_settlement_update();

CREATE OR REPLACE FUNCTION public.trg_block_overdue_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_overdue BOOLEAN;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(ccp.has_overdue, false)
  INTO   v_overdue
  FROM   public.customer_credit_profile ccp
  WHERE  ccp.customer_id = NEW.customer_id;

  IF v_overdue THEN
    RAISE EXCEPTION 'CUSTOMER_OVERDUE: این مشتری مانده معوق دارد. صدور فاکتور امکان‌پذیر نیست.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_overdue_invoice ON public.invoices;
CREATE TRIGGER trg_block_overdue_invoice
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_block_overdue_invoice();