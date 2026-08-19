-- 363-down.sql — reverse migration 363 (reversal metadata + cheque unique predicate).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction (Gate A M7).
--
-- ORDERING. 364 depends on these columns. If reverse_document is live, this file's DROP COLUMN
-- would leave 364 calling missing attributes. Same class as 361-down vs 362.
--
--   1. 364-down.sql FIRST  — drops reverse_document and restores 356/359/350 readers
--   2. THIS FILE           — restores the unconditional B1 unique index and drops the columns
--
-- Chosen shape: pre-flight GATE while 364 is applied, then the original reverse of 363.

SET client_encoding = 'UTF8';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reverse_document'
  ) THEN
    RAISE EXCEPTION
      '363-down refuses: reverse_document is still present. Run docs/verification/364-down.sql first, then this file. Dropping reversal columns now would leave the live RPC standing on missing attributes (OG-14 / Gate A M1 class).'
      USING ERRCODE = 'P0001';
  END IF;
END $$;

DROP INDEX IF EXISTS public.journal_entries_reverses_entry_unique_idx;
ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS reverses_entry_id;

ALTER TABLE public.payment_receipts
  DROP COLUMN IF EXISTS reversed_at,
  DROP COLUMN IF EXISTS reversed_by,
  DROP COLUMN IF EXISTS reversal_reason,
  DROP COLUMN IF EXISTS reversal_journal_entry_id,
  DROP COLUMN IF EXISTS reversal_document_number;

ALTER TABLE public.payment_vouchers
  DROP COLUMN IF EXISTS reversed_at,
  DROP COLUMN IF EXISTS reversed_by,
  DROP COLUMN IF EXISTS reversal_reason,
  DROP COLUMN IF EXISTS reversal_journal_entry_id,
  DROP COLUMN IF EXISTS reversal_document_number;

ALTER TABLE public.dual_documents
  DROP COLUMN IF EXISTS reversed_at,
  DROP COLUMN IF EXISTS reversed_by,
  DROP COLUMN IF EXISTS reversal_reason,
  DROP COLUMN IF EXISTS reversal_journal_entry_id,
  DROP COLUMN IF EXISTS reversal_document_number;

DROP INDEX IF EXISTS public.payment_vouchers_endorsed_receipt_unique_idx;
CREATE UNIQUE INDEX payment_vouchers_endorsed_receipt_unique_idx
  ON public.payment_vouchers (endorsed_receipt_id)
  WHERE endorsed_receipt_id IS NOT NULL;

COMMENT ON INDEX public.payment_vouchers_endorsed_receipt_unique_idx IS
  'One cheque is consumed once. UNCONDITIONAL since migration 356 (Gate A phase 3, B1).';
