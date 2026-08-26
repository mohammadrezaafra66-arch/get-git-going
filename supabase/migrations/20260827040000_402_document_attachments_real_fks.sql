SET client_encoding='UTF8';

-- 402 — M1 part 1: `document_attachments` gets REAL foreign keys, and `dual` stops being
-- refused. The hand-rolled existence trigger goes.
--
-- ────────────────────────────────────────────────────────────────────────────────────────────
-- WHERE THIS DEPARTS FROM THE INSTRUCTION, AND WHY
--
-- The instruction was: replace the hand-rolled FK with a real FK,
-- `document_attachments.document_id` → parent. **A real FK on that column is structurally
-- impossible**, and not for a stylistic reason: `document_id` is POLYMORPHIC. Its meaning
-- depends on `document_type`, which is one of 'receipt' | 'payment' | 'dual', naming three
-- DIFFERENT parent tables — `payment_receipts`, `payment_vouchers`, `dual_documents`.
-- PostgreSQL cannot point one column at three tables, which is exactly why the previous author
-- hand-rolled a trigger instead. The trigger is not a shortcut around a FK; it is what you are
-- forced into once the column is polymorphic.
--
-- So the polymorphism is the thing to remove, and then real FKs become possible. This migration
-- replaces the one polymorphic column with THREE typed nullable columns, each carrying a genuine
-- `REFERENCES … ON DELETE CASCADE`, plus a CHECK that exactly one is set. That delivers what the
-- instruction was actually for — real referential integrity enforced by the engine, not by a
-- trigger that direct writes can outrun — and it delivers more than the trigger ever could:
--
--   * The trigger validated only on INSERT and on UPDATE OF (document_type, document_id). A FK
--     is checked always, including by paths nobody anticipated.
--   * The trigger could not CASCADE. Two bespoke cleanup triggers existed to imitate that on
--     `payment_receipts` and `payment_vouchers` — and **`dual_documents` had none at all**
--     (verified: zero attachment triggers on it), so a deleted dual document would have left
--     its attachments behind forever. `ON DELETE CASCADE` closes that gap without anyone
--     having to remember it.
--   * `document_type='dual'` was refused at runtime by that same trigger even though the CHECK
--     constraint permitted it. With a typed column per parent there is nothing left to refuse.
--
-- ────────────────────────────────────────────────────────────────────────────────────────────
-- THE SECOND FINDING, WHICH CHANGES WHAT "ATTACHMENT BEFORE DOCUMENT" REQUIRES
--
-- It does NOT require a draft attachment row, and the already-built pieces prove it:
--   * `extractReceiptFromBytes` (`src/lib/receipt-ocr-bytes.functions.ts:56`) takes RAW BYTES
--     and no document id. Its own header says it exists to OCR "BEFORE the receipt is saved".
--   * `ReceiptDocumentPicker` (`PaymentReceiptDocuments.tsx:426`) stages `File[]` in React
--     state — in the browser, not in the database.
-- So the attachment precedes the document in the USER'S workflow, which is what was decided,
-- while both ROWS are created together inside the create RPC's single transaction.
--
-- That is why `document_id` stays NOT NULL in spirit — every attachment row is born already
-- linked — and it is why an orphaned attachment ROW is impossible by construction rather than
-- by cleanup. The columns are nullable only because three of them cannot all be NOT NULL at
-- once; the CHECK below is what makes "exactly one parent, always" true.
--
-- RESIDUAL RISK, stated rather than hidden: the storage OBJECT is uploaded before the RPC runs,
-- so an RPC failure can leave a file in the bucket with no row pointing at it. That is a
-- different orphan from the one the instruction names, it cannot be closed in the database, and
-- the client already handles the mirror case at `PaymentReceiptDocuments.tsx:387-390` by calling
-- `.remove([path])`. Part 2 wires the same rollback for this path.
--
-- SAFE TO RESHAPE: `document_attachments` holds **0 rows**, and `document_id`/`document_type`
-- are referenced by NOTHING in `src/` or `e2e/` (measured, zero hits) and by no view or
-- function other than the triggers this migration removes.

BEGIN;

-- The three real foreign keys. NOT VALID is deliberately NOT used: the table is empty, so a
-- full validation costs nothing and a NOT VALID constraint would be a lie waiting to be found.
ALTER TABLE public.document_attachments
  ADD COLUMN receipt_id uuid REFERENCES public.payment_receipts(id) ON DELETE CASCADE,
  ADD COLUMN voucher_id uuid REFERENCES public.payment_vouchers(id) ON DELETE CASCADE,
  ADD COLUMN dual_id    uuid REFERENCES public.dual_documents(id)   ON DELETE CASCADE;

-- Exactly one parent. Not "at most one": an attachment with no parent is the orphan row this
-- design exists to make impossible, and `num_nonnulls` states that in one expression.
ALTER TABLE public.document_attachments
  ADD CONSTRAINT document_attachments_exactly_one_parent
  CHECK (num_nonnulls(receipt_id, voucher_id, dual_id) = 1);

-- Indexes on the FK columns. Postgres indexes the referenced side automatically and the
-- referencing side never: without these, every cascading delete of a receipt scans this table.
CREATE INDEX IF NOT EXISTS idx_document_attachments_receipt ON public.document_attachments(receipt_id) WHERE receipt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_attachments_voucher ON public.document_attachments(voucher_id) WHERE voucher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_document_attachments_dual    ON public.document_attachments(dual_id)    WHERE dual_id    IS NOT NULL;

-- The hand-rolled FK and the two imitations of CASCADE. Dropped only now that real constraints
-- cover strictly more than they did.
DROP TRIGGER IF EXISTS trg_validate_document_attachment_ref ON public.document_attachments;
DROP FUNCTION IF EXISTS public.validate_document_attachment_ref();

DROP TRIGGER IF EXISTS trg_cleanup_receipt_attachments ON public.payment_receipts;
DROP FUNCTION IF EXISTS public.tg_cleanup_receipt_attachments();
DROP TRIGGER IF EXISTS trg_cleanup_payment_attachments ON public.payment_vouchers;
DROP FUNCTION IF EXISTS public.tg_cleanup_payment_attachments();

-- The polymorphic pair, now that nothing reads it. Dropped rather than left in place because
-- keeping a second, hand-maintained copy of "which parent" is precisely how two sources of
-- truth drift apart.
ALTER TABLE public.document_attachments
  DROP COLUMN document_id,
  DROP COLUMN document_type;

COMMIT;

-- Assertions. Two-sided: the new constraints must EXIST and must BITE, and the table must still
-- accept a legitimate row — a schema that refuses everything would satisfy the first half.
DO $verify$
DECLARE
  v_fks     int;
  v_receipt uuid;
  v_ok      boolean;
BEGIN
  SELECT count(*) INTO v_fks
    FROM pg_constraint
   WHERE conrelid = 'public.document_attachments'::regclass AND contype = 'f';
  IF v_fks <> 3 THEN
    RAISE EXCEPTION '402: expected 3 real foreign keys on document_attachments, found %', v_fks;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'validate_document_attachment_ref') THEN
    RAISE EXCEPTION '402: the hand-rolled existence trigger function still exists';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_attribute
              WHERE attrelid = 'public.document_attachments'::regclass
                AND attname IN ('document_id','document_type') AND NOT attisdropped) THEN
    RAISE EXCEPTION '402: the polymorphic columns are still present';
  END IF;

  SELECT id INTO v_receipt FROM public.payment_receipts LIMIT 1;
  IF v_receipt IS NULL THEN
    RAISE NOTICE '402: no receipt to exercise the constraints against; structure asserted only';
    RETURN;
  END IF;

  -- CLOSED half A: a row with NO parent must be refused.
  v_ok := false;
  BEGIN
    INSERT INTO public.document_attachments (storage_path, ocr_status, uploaded_by)
    VALUES ('402-probe/no-parent', 'pending', (SELECT user_id FROM public.user_roles LIMIT 1));
  EXCEPTION WHEN check_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION '402: an attachment with NO parent was accepted';
  END IF;

  -- CLOSED half B: a row pointing at a NON-EXISTENT parent must be refused by the real FK.
  v_ok := false;
  BEGIN
    INSERT INTO public.document_attachments (receipt_id, storage_path, ocr_status, uploaded_by)
    VALUES ('00000000-0000-0000-0000-000000000000', '402-probe/ghost', 'pending',
            (SELECT user_id FROM public.user_roles LIMIT 1));
  EXCEPTION WHEN foreign_key_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION '402: an attachment pointing at a non-existent receipt was accepted';
  END IF;

  -- CLOSED half C: TWO parents at once must be refused.
  v_ok := false;
  BEGIN
    INSERT INTO public.document_attachments (receipt_id, dual_id, storage_path, ocr_status, uploaded_by)
    VALUES (v_receipt, (SELECT id FROM public.dual_documents LIMIT 1), '402-probe/two', 'pending',
            (SELECT user_id FROM public.user_roles LIMIT 1));
  EXCEPTION WHEN check_violation THEN v_ok := true;
       WHEN not_null_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION '402: an attachment with two parents was accepted';
  END IF;

  -- OPEN half: a legitimate row must still be accepted. Rolled back immediately.
  BEGIN
    INSERT INTO public.document_attachments (receipt_id, storage_path, ocr_status, uploaded_by)
    VALUES (v_receipt, '402-probe/legit', 'pending', (SELECT user_id FROM public.user_roles LIMIT 1));
    DELETE FROM public.document_attachments WHERE storage_path = '402-probe/legit';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '402: a LEGITIMATE attachment was refused, so the schema rejects everything: %', SQLERRM;
  END;

  RAISE NOTICE '402: verified - 3 real FKs, no-parent/ghost-parent/two-parents all refused, a legitimate row accepted';
END
$verify$;
