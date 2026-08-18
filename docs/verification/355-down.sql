-- 355-down.sql — reverse migration 355 (create_payment).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction
-- (Gate A M7, phase-2 remediation). Apply for real with --single-transaction; dry-run with
-- docs/verification/rollback-dryrun.sql.
--
-- WHAT 355 ADDED: exactly one object, public.create_payment(...). It creates no table, alters no
-- column, and changes no existing function, so dropping it restores the previous state completely.
--
-- CLAUDE.md rule 5. The signature is spelled out in full. A DROP that names only the function name
-- would be ambiguous the moment a second overload exists, and adding a defaulted parameter later
-- creates exactly such an overload rather than replacing this one.
--
-- PRE-FLIGHT GATE. Dropping the function does NOT remove the vouchers, journal entries or document
-- numbers it created — those are business documents and migration 343 makes a posted entry
-- immutable. This file therefore reports what will be left behind rather than pretending a clean
-- reversal. It does not refuse: leaving posted documents in place is the correct outcome, and the
-- operator needs to know the count, not be blocked by it.

SET client_encoding = 'UTF8';

DO $$
DECLARE
  _v int; _e int; _n int;
BEGIN
  SELECT count(*) INTO _v FROM public.payment_vouchers pv
   WHERE EXISTS (SELECT 1 FROM public.document_numbers dn
                  WHERE dn.doc_type = 'payment' AND dn.source_id = pv.id);
  SELECT count(*) INTO _e FROM public.journal_entries
   WHERE source_type = 'payment_voucher' AND doc_kind = 'payment';
  SELECT count(*) INTO _n FROM public.document_numbers WHERE doc_type = 'payment';

  RAISE NOTICE '355-down: dropping create_payment. Left in place: % voucher(s) with a PAY number, % posted payment entr(ies), % payment document number(s). Posted entries are immutable (343) and are not removed by this file.',
    _v, _e, _n;
END $$;

DROP FUNCTION IF EXISTS public.create_payment(
  text,      -- p_channel
  text,      -- p_payee_type
  uuid,      -- p_payee_id
  numeric,   -- p_amount
  date,      -- p_payment_date
  uuid,      -- p_source_account_id
  text,      -- p_tracking_number
  text,      -- p_cheque_kind
  text,      -- p_cheque_number
  date,      -- p_cheque_due_date
  uuid,      -- p_endorsed_cheque_id
  uuid,      -- p_purchase_id
  text,      -- p_description
  uuid[]     -- p_attachment_ids
);
