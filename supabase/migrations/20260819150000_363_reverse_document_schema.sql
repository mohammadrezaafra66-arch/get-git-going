-- 363 — reversal metadata on source rows + journal link + cheque unique predicate
--
-- OG-14. reverse_document is not created here. This migration only makes the catalogue able to
-- record that a source document was undone without editing its posted journal entry (343).
--
-- ==============================================================================================
-- WHAT WRITES OR DEPENDS  (README-EXECUTION §H)
-- ==============================================================================================
--
-- journal_entries INSERT lists in create_receipt / create_payment / create_dual_document do not
-- mention reverses_entry_id; a nullable column is a no-op for them.
--
-- Readers of endorsed_receipt_id: create_payment ONLY (measured, same as 356). Unique index
-- becomes "not reversed" instead of unconditional. 0 payment_vouchers rows today; nothing to
-- migrate. The index must move here so 364 can mark a voucher reversed and free the cheque.
--
-- WHAT WILL READ THE NEW COLUMNS: reverse_document (364); vw_account_balances / get_account_ledger
-- / asan_list_bank_deposit_export (patched in 364). asan_list_journal_export is not touched.
--
-- Rollback: docs/verification/363-down.sql — statements only, 361-class gate while 364 is live.

SET client_encoding = 'UTF8';

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS reverses_entry_id uuid
    REFERENCES public.journal_entries(id);

COMMENT ON COLUMN public.journal_entries.reverses_entry_id IS
  'Set only on a reversing entry. Points at the original posted entry. The original row is never updated (343).';

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_reverses_entry_unique_idx
  ON public.journal_entries (reverses_entry_id)
  WHERE reverses_entry_id IS NOT NULL;

ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id uuid,
  ADD COLUMN IF NOT EXISTS reversal_document_number text;

ALTER TABLE public.payment_vouchers
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id uuid,
  ADD COLUMN IF NOT EXISTS reversal_document_number text;

ALTER TABLE public.dual_documents
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id uuid,
  ADD COLUMN IF NOT EXISTS reversal_document_number text;

DROP INDEX IF EXISTS public.payment_vouchers_endorsed_receipt_unique_idx;
CREATE UNIQUE INDEX payment_vouchers_endorsed_receipt_unique_idx
  ON public.payment_vouchers (endorsed_receipt_id)
  WHERE endorsed_receipt_id IS NOT NULL AND reversed_at IS NULL;

COMMENT ON INDEX public.payment_vouchers_endorsed_receipt_unique_idx IS
  'One cheque is consumed once (B1 / 356), until the endorsing voucher is reversed (OG-14 / 363). '
  'endorsed_receipt_id stays on the original voucher; reversed_at removes it from this index.';
