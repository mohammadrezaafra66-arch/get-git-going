ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_payment_receipts_duplicate_check
  ON public.payment_receipts (tracking_number, amount, payment_date, bank_name)
  WHERE status <> 'rejected';