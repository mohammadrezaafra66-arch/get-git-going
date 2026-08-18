-- 336 -- task 1.1 -- remove the dead receipt posting path
--
-- WHY
-- `post_receipt_journal(_receipt_id uuid)` was neutralised by migration 149 to
-- `RETURN NULL`. Its trigger `trg_payment_receipts_post_journal` is still attached to
-- `payment_receipts` and still fires on every insert and status change, reaching a function
-- that does nothing. Anyone reading pg_trigger concludes approval posts the ledger. It does
-- not. The authoritative path is `post_receipt_accounting`, called explicitly.
--
-- AUTHORISATION
-- OG-2: CONFIRMED 2026-08-18 -- owner authorised dropping
--   trg_payment_receipts_post_journal  and  post_receipt_journal.
--
-- SCOPE NOTE (recorded, deliberately NOT acted on)
-- The trigger executes `trg_post_receipt_on_approve()`, which is the function that calls
-- `post_receipt_journal`. Measured on 2026-08-18:
--   * post_receipt_journal has exactly ONE caller: trg_post_receipt_on_approve
--   * trg_post_receipt_on_approve has exactly ONE trigger: the one dropped here
-- After this migration `trg_post_receipt_on_approve()` is unreferenced dead code whose body
-- calls a dropped function. It is harmless (nothing can invoke it) but it is dead.
-- It is NOT dropped here because OG-2 names only two objects and this migration does not
-- exceed the owner's written authorisation. Raised for an owner decision; see
-- docs/execution/phase-1-PROGRESS.md task 1.1.
--
-- ROLLBACK: docs/verification/336-down.sql (captured from live before the drop)

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() <> 'afrakala' THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

DROP TRIGGER IF EXISTS trg_payment_receipts_post_journal ON public.payment_receipts;

DROP FUNCTION IF EXISTS public.post_receipt_journal(_receipt_id uuid);

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'post_receipt_journal') THEN
    RAISE EXCEPTION '336: post_receipt_journal still exists after drop';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payment_receipts_post_journal') THEN
    RAISE EXCEPTION '336: trg_payment_receipts_post_journal still exists after drop';
  END IF;
END
$verify$;
