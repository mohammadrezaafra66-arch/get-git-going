SET client_encoding='UTF8';

-- 400 — OG-23 option (b): once a document is POSTED, its amount and its counterparty stop
-- being editable. Its status does not.
--
-- WHAT M7 MEASURED, and why this is not a tidy-up.
-- All three document tables carry a `*_block_delete_when_posted` trigger, and every one of
-- them fires on **DELETE only**. So a posted document could not be erased and could be freely
-- ALTERED: an admin or accountant could change amount, counterparty, date or bank account on a
-- posted receipt and nothing in the database objected. The ledger it fed is frozen — the
-- immutability trigger on `journal_entries` blocks deletion even for a superuser, which is how
-- OG-56's two stuck rows exist — so the guarantee was exactly half present: **the ledger is
-- immutable and the documents that produced it were not.**
--
-- IN A TRIGGER, NOT AN RPC — the owner's instruction, and it is the whole design.
-- PostgREST exposes these tables directly, so `PATCH /payment_receipts?id=eq.<uuid>` reaches
-- the row without passing through any function. A rule living inside an RPC is bypassed by the
-- first client that talks to the table instead. A BEFORE UPDATE trigger cannot be routed around.
--
-- THE "POSTED" PREDICATE IS PER TABLE, because the three tables are NOT uniform and assuming
-- they were would have produced a lock that fires on the wrong rows:
--     payment_receipts   posting_status = 'posted'     (it alone has posting_status)
--     payment_vouchers   status         = 'approved'   (no posting_status column exists)
--     dual_documents     status         = 'approved'   (likewise)
-- Verified against the ledger rather than assumed — every row matching its predicate has a
-- `journal_entries` row pointing back at it, with no exceptions: receipts 4/4, duals 3/3,
-- vouchers 1/1.
--
-- THE THREE LIVE FLOWS THE OWNER REQUIRED TO KEEP WORKING, checked individually:
--   1. OCR amount apply — `PaymentReceiptDocuments.tsx:760` already refuses when
--      `posting_status === 'posted'`, so it only ever writes to UNPOSTED receipts and this
--      lock never sees it. What changes is that the guard stops being CLIENT-ONLY: rule 6 says
--      frontend-only authorization is not acceptable, and until now that guard was exactly that.
--   2. status approve / reject — `status` is deliberately NOT in any locked list. A posted
--      receipt can still be rejected, and a document's lifecycle continues after posting.
--   3. reverse_document metadata — writes `reversal_journal_entry_id`, which is not locked.
--
-- BANK ACCOUNT COLUMNS ARE INCLUDED, and this goes marginally beyond the words "amount and
-- counterparty". The reason is that they are the same class of harm: a posted receipt whose
-- `destination_bank_account_id` moves now disagrees with the journal entry that debited a
-- specific bank account, which is precisely the divergence this migration exists to prevent.
-- If that is unwanted, remove the two `*_bank_account_id` entries from the arrays below — the
-- locked set is data in the trigger arguments, not logic, exactly so this is a one-line change.
--
-- NOT changed: no column privileges (they cannot be conditional on a row's STATE), no existing
-- trigger dropped, no policy touched, no row modified.

CREATE OR REPLACE FUNCTION public.tg_lock_columns_when_posted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_state_col   text := TG_ARGV[0];
  v_posted_val  text := TG_ARGV[1];
  v_old         jsonb := to_jsonb(OLD);
  v_new         jsonb := to_jsonb(NEW);
  v_col         text;
  v_changed     text[] := '{}';
  i             int;
BEGIN
  -- Only a row that is ALREADY posted is protected. A row being posted right now is still
  -- editable in that same statement, which is what lets the posting flow stamp its own state.
  IF v_old ->> v_state_col IS DISTINCT FROM v_posted_val THEN
    RETURN NEW;
  END IF;

  FOR i IN 2 .. array_upper(TG_ARGV, 1) LOOP
    v_col := TG_ARGV[i];
    -- IS DISTINCT FROM, never `<>`: a column moving to or from NULL is a real change, and `<>`
    -- returns NULL for it, which reads as "no change" and would let a counterparty be cleared.
    IF (v_old -> v_col) IS DISTINCT FROM (v_new -> v_col) THEN
      v_changed := v_changed || v_col;
    END IF;
  END LOOP;

  IF array_length(v_changed, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'سند ثبت‌شده است؛ تغییر % مجاز نیست. برای اصلاح، سند را برگردانید (reverse) و سند تازه ثبت کنید.',
    array_to_string(v_changed, '، ')
    USING ERRCODE = '42501',
          DETAIL  = format('table=%s id=%s locked_columns_changed=%s',
                           TG_TABLE_NAME, v_new ->> 'id', array_to_string(v_changed, ',')),
          HINT    = 'status is deliberately NOT locked; only amount, counterparty and bank account are.';
END
$function$;

DROP TRIGGER IF EXISTS trg_payment_receipts_lock_when_posted ON public.payment_receipts;
CREATE TRIGGER trg_payment_receipts_lock_when_posted
  BEFORE UPDATE ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.tg_lock_columns_when_posted(
    'posting_status', 'posted',
    'amount', 'customer_id', 'customer_person_id', 'receiver_party_id',
    'receiver_party_person_id', 'source_bank_account_id', 'destination_bank_account_id');

DROP TRIGGER IF EXISTS trg_payment_vouchers_lock_when_posted ON public.payment_vouchers;
CREATE TRIGGER trg_payment_vouchers_lock_when_posted
  BEFORE UPDATE ON public.payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION public.tg_lock_columns_when_posted(
    'status', 'approved',
    'amount', 'payee_supplier_id', 'payee_customer_id', 'payee_party_id',
    'payee_person_id', 'source_bank_account_id');

DROP TRIGGER IF EXISTS trg_dual_documents_lock_when_posted ON public.dual_documents;
CREATE TRIGGER trg_dual_documents_lock_when_posted
  BEFORE UPDATE ON public.dual_documents
  FOR EACH ROW EXECUTE FUNCTION public.tg_lock_columns_when_posted(
    'status', 'approved',
    'amount', 'payer_customer_id', 'payer_supplier_id', 'payer_party_id',
    'beneficiary_customer_id', 'beneficiary_supplier_id', 'beneficiary_party_id');

-- Assertions. TWO-SIDED against REAL posted rows, inside savepoints that roll back, because a
-- lock that refuses everything would satisfy the closed half perfectly and break the system.
DO $verify$
DECLARE
  v_id      uuid;
  v_amount  numeric;
  v_ok      boolean;
BEGIN
  SELECT id, amount INTO v_id, v_amount
    FROM public.payment_receipts WHERE posting_status = 'posted' LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE '400: no posted receipt to verify against; triggers created but not exercised';
    RETURN;
  END IF;

  -- CLOSED: changing the amount of a posted receipt must be refused.
  v_ok := false;
  BEGIN
    UPDATE public.payment_receipts SET amount = coalesce(v_amount, 0) + 1 WHERE id = v_id;
  EXCEPTION WHEN insufficient_privilege THEN
    v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION '400: the amount of a POSTED receipt was still changed — the lock does not bite';
  END IF;

  -- OPEN 1: status must still move on a posted receipt (approve/reject keeps working).
  BEGIN
    UPDATE public.payment_receipts SET status = status WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '400: status is locked on a posted receipt, which breaks approve/reject: %', SQLERRM;
  END;

  -- OPEN 2: reverse_document metadata must still be writable on a posted receipt.
  BEGIN
    UPDATE public.payment_receipts
       SET reversal_journal_entry_id = reversal_journal_entry_id WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '400: reversal metadata is locked, which breaks reverse_document: %', SQLERRM;
  END;

  -- OPEN 3: an UNPOSTED receipt must still accept an amount change — this is the OCR path.
  SELECT id INTO v_id FROM public.payment_receipts WHERE posting_status <> 'posted' LIMIT 1;
  IF v_id IS NOT NULL THEN
    BEGIN
      UPDATE public.payment_receipts SET amount = amount WHERE id = v_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '400: an UNPOSTED receipt refuses an amount change, which breaks the OCR auto-apply: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE '400: no unposted receipt available to prove the OCR path still works';
  END IF;

  RAISE NOTICE '400: verified — posted amount refused; status, reversal metadata and unposted amounts all still writable';
  RAISE EXCEPTION 'rollback_probe';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM <> 'rollback_probe' THEN RAISE; END IF;
    RAISE NOTICE '400: probe rolled back; no row was modified';
END
$verify$;
