
CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  payer_name text NOT NULL,
  payer_phone text,
  payer_accounting_code text,
  receiver_name text NOT NULL,
  receiver_phone text,
  receiver_accounting_code text,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL,
  payment_time time NOT NULL,
  tracking_number text NOT NULL,
  bank_name text,
  receipt_image_url text,
  description text,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipts_customer_id_idx ON public.payment_receipts(customer_id);
CREATE INDEX IF NOT EXISTS receipts_status_idx ON public.payment_receipts(status);
CREATE INDEX IF NOT EXISTS receipts_tracking_idx ON public.payment_receipts(tracking_number);
CREATE INDEX IF NOT EXISTS receipts_created_at_idx ON public.payment_receipts(created_at DESC);

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pr_select_privileged ON public.payment_receipts;
CREATE POLICY pr_select_privileged ON public.payment_receipts
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role, 'accountant'::app_role]));

DROP POLICY IF EXISTS pr_insert_admin_accountant ON public.payment_receipts;
CREATE POLICY pr_insert_admin_accountant ON public.payment_receipts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role])
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS pr_update_admin_accountant ON public.payment_receipts;
CREATE POLICY pr_update_admin_accountant ON public.payment_receipts
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]));

DROP TRIGGER IF EXISTS trg_payment_receipts_updated_at ON public.payment_receipts;
CREATE TRIGGER trg_payment_receipts_updated_at
  BEFORE UPDATE ON public.payment_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_now();
