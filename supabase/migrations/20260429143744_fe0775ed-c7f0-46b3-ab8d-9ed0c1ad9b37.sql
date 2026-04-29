-- 1) Receipt type column
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS receipt_type text NOT NULL DEFAULT 'payment';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_receipts_receipt_type_check'
  ) THEN
    ALTER TABLE public.payment_receipts
      ADD CONSTRAINT payment_receipts_receipt_type_check
      CHECK (receipt_type IN ('payment','prepayment'));
  END IF;
END$$;

-- 2) Receipt links table
CREATE TABLE IF NOT EXISTS public.payment_receipt_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.payment_receipts(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_receipt_links_unique UNIQUE (receipt_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_prl_receipt_id ON public.payment_receipt_links(receipt_id);
CREATE INDEX IF NOT EXISTS idx_prl_invoice_id ON public.payment_receipt_links(invoice_id);

ALTER TABLE public.payment_receipt_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prl_select_privileged ON public.payment_receipt_links;
CREATE POLICY prl_select_privileged
  ON public.payment_receipt_links
  FOR SELECT
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'manager'::app_role,'accountant'::app_role]));

DROP POLICY IF EXISTS prl_write_admin_accountant ON public.payment_receipt_links;
CREATE POLICY prl_write_admin_accountant
  ON public.payment_receipt_links
  FOR ALL
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'accountant'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role,'accountant'::app_role]));