-- 350 — the Asan bank-deposit export carries bank receipts only
--
-- Gate A phase 2, defect B1 (docs/execution/phase-2-GATE-A.md).
--
-- WHY
--
-- asan_list_bank_deposit_export selects purely on
--   status = 'approved' AND destination_bank_account_id IS NOT NULL
-- and never looks at document_channel. Migration 349's create_receipt requires a destination
-- account for the CASH branch too (contradiction C5: a cash box is a bank_accounts row with
-- account_type='cash', decision D2, and the debit line needs a reference), and — because
-- payment_receipts.tracking_number is NOT NULL with no default and cash has no bank reference —
-- it mints tracking_number as 'INT-' || document_number.
--
-- The measured consequence (Gate A B1, reproduced inside BEGIN … ROLLBACK):
--
--   T3 cash receipt | doc=RCP-1405-000054 channel=cash tracking=INT-RCP-1405-000054
--                     dest_account_type=bank debit_kind=bank
--   T3 cash row inside the BANK-DEPOSIT export | tracking=INT-RCP-1405-000054 amount=777000.00
--                     bank_code=8 blocked=<none>
--
-- A cash receipt was published as a bank deposit, with an internal counter in the column the
-- export publishes as the bank transfer reference, and blocked_reason NULL so nothing warned.
--
-- THE OWNER'S ANSWER (2026-08-18), option (c): a cash receipt produces NO Asan export row at all.
-- The standing workflow it confirms:
--
--   receipt / payment, bank    -> automatic, via this export
--   receipt / payment, cash    -> MANUAL
--   receipt / payment, cheque  -> MANUAL
--   dual document              -> automatic
--
-- CHEQUE IS EXCLUDED TOO, AND THAT IS NOT SCOPE CREEP. B1 names cash because cash is what the
-- reviewer reproduced, but cheque is manual for exactly the same reason and reaches this export by
-- exactly the same route the moment a cheque receipt is ever given a destination account. Fixing
-- only cash would reproduce this defect one version later under document_channel='cheque'.
--
-- Cash and cheque receipts are still recorded in AfraKala in full. AfraKala must eventually replace
-- Asan, so the data stays complete even where no file is generated today. Nothing about the source
-- row, the journal entry or the customer balance changes here — only which rows this one export
-- returns.
--
-- WHAT READS WHAT I AM ABOUT TO CHANGE (asked in writing before writing, per the mission):
--
--   * src/lib/asan/export-bank-deposit.ts calls this function by name through PostgREST, and is
--     registered in src/lib/asan/export-registry.ts:13, which backs /admin/asan-export. The
--     signature (date, date) and the RETURNS TABLE column list are UNCHANGED, so no caller,
--     type or PostgREST binding changes. Verified: grep -rn asan_list_bank_deposit_export src/
--     returns export-bank-deposit.ts:32 and nothing else.
--   * No other function, view or trigger calls it: a catalogue scan of every public function body
--     for 'asan_list_bank_deposit_export' returns only this function itself.
--
-- WHAT WRITES WHAT I AM ABOUT TO CHANGE: nothing writes a function. The rows it reads are written
-- by create_receipt (349) and by the legacy PaymentReceiptForm.tsx path (D12, until task 6.9).
--
-- BLAST RADIUS ON EXISTING ROWS: zero. Measured immediately before writing this migration:
--
--   <NULL> | status=approved       | dest_bank=true  | n=51
--   <NULL> | status=pending_review | dest_bank=true  | n=1
--   other  | status=pending_review | dest_bank=false | n=1
--   paya   | status=pending_review | dest_bank=false | n=4
--
-- No row on this database carries document_channel 'cash' or 'cheque', so this predicate removes
-- nothing that the accountant exports today. The bank sub-channels the export must KEEP —
-- card_to_card, paya, pol, satna, other — are unaffected, and so is NULL, which is what 349 stores
-- for the bank branch (contradiction C6).
--
-- Rollback: docs/verification/350-down.sql. Read its header first — rolling this back restores the
-- behaviour the owner rejected.

SET client_encoding = 'UTF8';

CREATE OR REPLACE FUNCTION public.asan_list_bank_deposit_export(_from date, _to date)
 RETURNS TABLE(doc_id uuid, doc_label text, doc_date date, party_name text, person_code text,
               tracking_number text, amount numeric, bank_code text, bank_title text,
               blocked_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'accountant'::app_role]) THEN
    RAISE EXCEPTION 'اجازهٔ خروجی گرفتن از واریزیهای بانکی را ندارید' USING ERRCODE = '42501';
  END IF;
  IF _from IS NULL OR _to IS NULL OR _to < _from THEN
    RAISE EXCEPTION 'بازهٔ تاریخ خروجی معتبر نیست' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT pr.id,
           pr.payment_date AS pdate,
           COALESCE(NULLIF(btrim(pr.payer_name), ''), '') AS pname,
           NULLIF(btrim(pr.tracking_number), '') AS tracking,
           pr.amount AS amt,
           (SELECT pi.value_normalized
              FROM public.person_identifiers pi
             WHERE pi.person_id = COALESCE(
                     pr.customer_person_id,
                     (SELECT c.person_id FROM public.customers c WHERE c.id = pr.customer_id))
               AND pi.kind = 'asan_person_code'
             LIMIT 1) AS pcode,
           (SELECT NULLIF(btrim(ba.accounting_code), '') FROM public.bank_accounts ba
             WHERE ba.id = pr.destination_bank_account_id) AS bcode,
           (SELECT ba.title FROM public.bank_accounts ba
             WHERE ba.id = pr.destination_bank_account_id) AS btitle
      FROM public.payment_receipts pr
     WHERE pr.status = 'approved'
       AND pr.destination_bank_account_id IS NOT NULL
       -- 350 / Gate A B1, owner answer (c): cash and cheque go to Asan by hand, so they must not
       -- appear in the automatic bank-deposit file. NULL is kept deliberately — it is what the
       -- bank branch stores until the phase-6 wizard collects the real sub-channel (C6).
       AND (pr.document_channel IS NULL
            OR pr.document_channel NOT IN ('cash', 'cheque'))
       AND pr.payment_date BETWEEN _from AND _to
  )
  SELECT r.id,
         'واریز ' || to_char(r.pdate, 'YYYY-MM-DD') || ' — ' ||
           COALESCE(NULLIF(r.pname, ''), left(r.id::text, 8)),
         r.pdate,
         r.pname,
         r.pcode,
         r.tracking,
         r.amt,
         r.bcode,
         r.btitle,
         CASE
           WHEN r.pcode IS NULL OR btrim(r.pcode) = ''
             THEN 'کد آسان برای «' || COALESCE(NULLIF(r.pname, ''), '؟') || '» ثبت نشده است'
           WHEN r.bcode IS NULL
             THEN 'کد آسان حساب بانکی مقصد ثبت نشده است'
           WHEN r.amt IS NULL OR r.amt <= 0
             THEN 'مبلغ این واریز معتبر نیست'
           WHEN r.amt <> trunc(r.amt)
             THEN 'مبلغ این واریز عدد صحیح تومانی نیست و قابل تبدیل دقیق به ریال نیست'
           ELSE NULL
         END
    FROM r
   ORDER BY r.pdate, r.id;
END;
$function$;

COMMENT ON FUNCTION public.asan_list_bank_deposit_export(date, date) IS
  'Asan bank-deposit export. Approved receipts that landed in one of our bank accounts. '
  'Cash and cheque receipts are excluded (migration 350, Gate A B1, owner answer (c)): they are '
  'recorded in AfraKala in full but submitted to Asan manually.';
