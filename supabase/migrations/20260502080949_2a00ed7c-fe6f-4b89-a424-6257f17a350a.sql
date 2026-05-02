ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS source_bank text,
  ADD COLUMN IF NOT EXISTS destination_bank text,
  ADD COLUMN IF NOT EXISTS payer_name_on_receipt text,
  ADD COLUMN IF NOT EXISTS receiver_name_on_receipt text,
  ADD COLUMN IF NOT EXISTS has_perforation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS document_channel text,
  ADD COLUMN IF NOT EXISTS is_typed_receipt boolean NOT NULL DEFAULT false;

ALTER TABLE public.payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_document_channel_check;

ALTER TABLE public.payment_receipts
  ADD CONSTRAINT payment_receipts_document_channel_check
  CHECK (document_channel IS NULL OR document_channel IN ('card_to_card','paya','pol','satna','cash','other'));