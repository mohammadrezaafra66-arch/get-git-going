ALTER TABLE public.payment_receipt_documents
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS extracted_data jsonb,
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric,
  ADD COLUMN IF NOT EXISTS extraction_notes text;

ALTER TABLE public.payment_receipt_documents
  DROP CONSTRAINT IF EXISTS payment_receipt_documents_extraction_status_check;

ALTER TABLE public.payment_receipt_documents
  ADD CONSTRAINT payment_receipt_documents_extraction_status_check
  CHECK (extraction_status IN ('pending','extracted','needs_review','failed'));

ALTER TABLE public.payment_receipt_documents
  DROP CONSTRAINT IF EXISTS payment_receipt_documents_confidence_check;

ALTER TABLE public.payment_receipt_documents
  ADD CONSTRAINT payment_receipt_documents_confidence_check
  CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1));