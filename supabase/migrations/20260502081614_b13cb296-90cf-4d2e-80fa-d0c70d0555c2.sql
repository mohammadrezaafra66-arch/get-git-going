ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS security_warnings jsonb NOT NULL DEFAULT '[]'::jsonb;