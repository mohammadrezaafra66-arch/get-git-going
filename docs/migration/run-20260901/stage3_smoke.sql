SET client_encoding='UTF8';

-- Stage 3 RPC smoke test, per the v6 runbook section
-- "Reproducing the RPC smoke test on production — the exact fixtures".
-- EVERYTHING here is inside BEGIN ... ROLLBACK and persists nothing.

BEGIN;

DO $smoke$
DECLARE
  v_admin  uuid;
  v_c1     uuid;
  v_c2     uuid;
  v_bank   uuid;
  r_chq    record;
  r_bnk    record;
  r_pay    record;
  r_dual   record;
  v_rev    uuid;
BEGIN
  -- act as a real admin
  SELECT user_id INTO v_admin FROM public.user_roles WHERE role::text = 'admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims',
           json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
  RAISE NOTICE 'SMOKE: acting as admin %', v_admin;

  -- two REAL customers that have a person link
  SELECT c.id INTO v_c1 FROM public.customers c
   WHERE c.person_id IS NOT NULL ORDER BY c.created_at LIMIT 1;
  SELECT c.id INTO v_c2 FROM public.customers c
   WHERE c.person_id IS NOT NULL ORDER BY c.created_at OFFSET 1 LIMIT 1;
  RAISE NOTICE 'SMOKE: customers % and %', v_c1, v_c2;

  -- synthetic fixture 1: ASAN codes for their persons (production has zero)
  INSERT INTO public.person_identifiers (person_id, kind, value_raw, value_normalized)
  SELECT c.person_id, 'asan_person_code', '900001', '900001'
    FROM public.customers c
   WHERE c.id = v_c1;
  INSERT INTO public.person_identifiers (person_id, kind, value_raw, value_normalized)
  SELECT c.person_id, 'asan_person_code', '900002', '900002'
    FROM public.customers c
   WHERE c.id = v_c2;
  RAISE NOTICE 'SMOKE: asan fixtures inserted';

  -- synthetic fixture 2: a bank account WITH an accounting code (production has zero)
  INSERT INTO public.bank_accounts (title, bank_name, account_type, currency,
                                    is_active, opening_balance, accounting_code)
  VALUES ('smoke test', 'ملت', 'bank', 'IRR', true, 0, '110001')
  RETURNING id INTO v_bank;
  RAISE NOTICE 'SMOKE: bank account fixture %', v_bank;

  -- 1. create_receipt, CHEQUE channel (needs no bank account)
  SELECT * INTO r_chq FROM public.create_receipt(
    'cheque', v_c1, 5000000, current_date, '10:00',
    NULL, 'SMOKE-CHQ', NULL, 'CHQ-1', current_date + 30, 'ملت', 'smoke');
  RAISE NOTICE 'RPC create_receipt(CHEQUE) -> doc=% journal=% balance=%',
    r_chq.document_number, r_chq.journal_entry_id, r_chq.new_balance;

  -- 2. create_receipt, BANK channel
  SELECT * INTO r_bnk FROM public.create_receipt(
    'bank', v_c1, 7000000, current_date, '11:00',
    v_bank, 'SMOKE-BNK', 'ملت', NULL, NULL, NULL, 'smoke');
  RAISE NOTICE 'RPC create_receipt(BANK) -> doc=% journal=% balance=%',
    r_bnk.document_number, r_bnk.journal_entry_id, r_bnk.new_balance;

  -- 3. create_payment
  SELECT * INTO r_pay FROM public.create_payment(
    'bank', 'customer', v_c2, 3000000, current_date,
    v_bank, 'SMOKE-PAY', NULL, NULL, NULL, NULL, NULL, 'smoke');
  RAISE NOTICE 'RPC create_payment -> doc=% journal=% balance=%',
    r_pay.document_number, r_pay.journal_entry_id, r_pay.new_balance;

  -- 4. create_dual_document
  SELECT * INTO r_dual FROM public.create_dual_document(
    'customer', v_c1, 'customer', v_c2, 2000000, current_date, 'SMOKE-DUAL', 'smoke');
  RAISE NOTICE 'RPC create_dual_document -> id=% doc=% journal=%',
    r_dual.document_id, r_dual.document_number, r_dual.journal_entry_id;

  -- 5. reverse_document, on the dual document just created
  SELECT public.reverse_document('dual', r_dual.document_id, 'smoke reversal') INTO v_rev;
  RAISE NOTICE 'RPC reverse_document(dual) -> reversal entry %', v_rev;
END
$smoke$;

-- the only assertion that matters
SELECT count(*)             AS lines,
       sum(debit)           AS debits,
       sum(credit)          AS credits,
       sum(debit)=sum(credit) AS balanced
  FROM public.journal_lines;

-- what was written, before it disappears
SELECT 'documents'        AS what, count(*)::text AS n FROM public.dual_documents
UNION ALL SELECT 'document_numbers', count(*)::text FROM public.document_numbers
UNION ALL SELECT 'journal_entries',  count(*)::text FROM public.journal_entries
UNION ALL SELECT 'payment_receipts', count(*)::text FROM public.payment_receipts
UNION ALL SELECT 'payment_vouchers', count(*)::text FROM public.payment_vouchers
UNION ALL SELECT 'bank_accounts',    count(*)::text FROM public.bank_accounts
UNION ALL SELECT 'asan_codes',       count(*)::text FROM public.person_identifiers WHERE kind='asan_person_code';

ROLLBACK;
