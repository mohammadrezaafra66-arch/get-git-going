
-- Helper trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1) bank_accounts
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  bank_name text NOT NULL,
  iban text,
  account_no text,
  card_no text,
  currency text NOT NULL DEFAULT 'IRR',
  opening_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_accounts_select_finance"
  ON public.bank_accounts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "bank_accounts_insert_admin_accountant"
  ON public.bank_accounts FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "bank_accounts_update_admin_accountant"
  ON public.bank_accounts FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

DROP TRIGGER IF EXISTS trg_bank_accounts_updated_at ON public.bank_accounts;
CREATE TRIGGER trg_bank_accounts_updated_at
  BEFORE UPDATE ON public.bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) external_parties
CREATE TABLE IF NOT EXISTS public.external_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  national_id text,
  phone text,
  accounting_code text UNIQUE,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.external_parties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "external_parties_select_finance"
  ON public.external_parties FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "external_parties_insert_admin_accountant"
  ON public.external_parties FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "external_parties_update_admin_accountant"
  ON public.external_parties FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  );

DROP TRIGGER IF EXISTS trg_external_parties_updated_at ON public.external_parties;
CREATE TRIGGER trg_external_parties_updated_at
  BEFORE UPDATE ON public.external_parties
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) payment_receipts: nullable references
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS source_bank_account_id uuid REFERENCES public.bank_accounts(id),
  ADD COLUMN IF NOT EXISTS destination_bank_account_id uuid REFERENCES public.bank_accounts(id),
  ADD COLUMN IF NOT EXISTS receiver_party_id uuid REFERENCES public.external_parties(id);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_dest_bank
  ON public.payment_receipts(destination_bank_account_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_src_bank
  ON public.payment_receipts(source_bank_account_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_receiver_party
  ON public.payment_receipts(receiver_party_id);
