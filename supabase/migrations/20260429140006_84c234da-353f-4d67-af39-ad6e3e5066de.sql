-- F-4: Credit vs advance-payment pre-invoice — base structure
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'pre_invoice',
  ADD COLUMN IF NOT EXISTS deposit_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS commitment_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS issued_by uuid REFERENCES auth.users(id);

-- Allowed values for invoice_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_type_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_invoice_type_check
      CHECK (invoice_type IN ('pre_invoice', 'advance_payment'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_type ON public.invoices(invoice_type);

-- Audit trigger: log invoice_type changes & advance_payment issuance
CREATE OR REPLACE FUNCTION public.invoices_log_type_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.invoice_type = 'advance_payment' THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (
        auth.uid(), 'invoice', NEW.id::text, 'advance_payment_issued',
        jsonb_build_object(
          'invoice_id', NEW.id,
          'issued_by', NEW.issued_by,
          'total_amount', NEW.total_amount,
          'customer_id', NEW.customer_id
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.invoice_type,'') <> COALESCE(NEW.invoice_type,'') THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (
      auth.uid(), 'invoice', NEW.id::text, 'invoice_type_changed',
      jsonb_build_object('old', OLD.invoice_type, 'new', NEW.invoice_type)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_log_type_changes ON public.invoices;
CREATE TRIGGER trg_invoices_log_type_changes
AFTER INSERT OR UPDATE OF invoice_type ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.invoices_log_type_changes();