ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS receipt_time text;

ALTER TABLE public.payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_receipt_time_format_check;

ALTER TABLE public.payment_receipts
  ADD CONSTRAINT payment_receipts_receipt_time_format_check
  CHECK (receipt_time IS NULL OR receipt_time ~ '^\d{2}:\d{2}$');