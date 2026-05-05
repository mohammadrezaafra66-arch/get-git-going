-- 1. payment_receipt_custom_fields
CREATE TABLE IF NOT EXISTS public.payment_receipt_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key text NOT NULL UNIQUE,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','date','select')),
  field_options jsonb,
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prcf_key_format CHECK (field_key ~ '^[a-z][a-z0-9_]{0,29}$'),
  CONSTRAINT prcf_label_len CHECK (char_length(field_label) BETWEEN 1 AND 100)
);

ALTER TABLE public.payment_receipt_custom_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prcf_select_authed ON public.payment_receipt_custom_fields;
CREATE POLICY prcf_select_authed
  ON public.payment_receipt_custom_fields FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS prcf_write_admin_accountant ON public.payment_receipt_custom_fields;
CREATE POLICY prcf_write_admin_accountant
  ON public.payment_receipt_custom_fields FOR ALL
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::app_role[]));

DROP TRIGGER IF EXISTS trg_prcf_updated_at ON public.payment_receipt_custom_fields;
CREATE TRIGGER trg_prcf_updated_at
  BEFORE UPDATE ON public.payment_receipt_custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_prcf_active_sort
  ON public.payment_receipt_custom_fields(is_active, sort_order);

-- 2. custom_data on payment_receipts
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS custom_data jsonb NOT NULL DEFAULT '{}'::jsonb;
