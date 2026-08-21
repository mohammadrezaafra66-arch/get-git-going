-- programme-audit e2e. Caller wraps BEGIN; \i this; ROLLBACK;
SET client_encoding = 'UTF8';
\pset pager off
SELECT set_config('request.jwt.claims',
  '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}', true);

-- live committed journals
SELECT 'LIVE_JE' AS step, id, doc_kind, reverses_entry_id IS NOT NULL AS is_rev, left(description,60) AS d
  FROM public.journal_entries ORDER BY created_at;

SELECT 'LIVE_PR' AS step, id, tracking_number, document_channel, amount, left(coalesce(description,''),40)
  FROM public.payment_receipts ORDER BY created_at DESC LIMIT 10;

-- 0A000 attachments
DO $$
BEGIN
  PERFORM * FROM public.create_receipt(
    p_channel := 'bank', p_customer_id := '9685a046-9d89-4573-b204-239955c7527e',
    p_amount := 101000, p_payment_date := public.tehran_today(), p_payment_time := '10:00',
    p_destination_bank_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_tracking_number := 'AUD-ATT', p_attachment_ids := ARRAY[gen_random_uuid()]);
  RAISE NOTICE 'ATT_UNEXPECTED_OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ATT sqlstate=% msg=%', SQLSTATE, left(SQLERRM,80);
END $$;

-- cash without cash box
DO $$
BEGIN
  PERFORM * FROM public.create_receipt(
    p_channel := 'cash', p_customer_id := '9685a046-9d89-4573-b204-239955c7527e',
    p_amount := 102000, p_payment_date := public.tehran_today(), p_payment_time := '10:00');
  RAISE NOTICE 'CASH_UNEXPECTED_OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'CASH_NO_BOX sqlstate=% msg=%', SQLSTATE, left(SQLERRM,80);
END $$;

-- bank receipt + reverse + export
SELECT 'R_BANK' AS step, r.receipt_id, r.journal_entry_id
  FROM public.create_receipt(
    p_channel := 'bank', p_customer_id := '9685a046-9d89-4573-b204-239955c7527e',
    p_amount := 201000, p_payment_date := public.tehran_today(), p_payment_time := '11:00',
    p_destination_bank_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_tracking_number := 'AUD-RBANK', p_description := 'audit bank rec') r;

SELECT 'R_BANK_BAL' AS step, je.doc_kind,
       (SELECT sum(debit) FROM journal_lines WHERE journal_entry_id=je.id) AS dr,
       (SELECT sum(credit) FROM journal_lines WHERE journal_entry_id=je.id) AS cr
  FROM journal_entries je JOIN payment_receipts pr ON pr.id=je.source_id
 WHERE pr.tracking_number='AUD-RBANK';

SELECT 'R_BANK_VW' AS step, title, total_in, total_out
  FROM vw_account_balances WHERE account_id='32a4c282-85a3-485c-bbb4-dae3bb4febd6';

SELECT 'R_BANK_EXP' AS step, count(*) AS n, count(*) FILTER (WHERE blocked_reason IS NULL) AS unblocked
  FROM asan_list_journal_export(public.tehran_today(), public.tehran_today(), 'receipt') e
  JOIN journal_entries je ON je.id=e.doc_id
  JOIN payment_receipts pr ON pr.id=je.source_id WHERE pr.tracking_number='AUD-RBANK';

SELECT 'R_BANK_REV' AS step, public.reverse_document(
  'receipt', (SELECT id FROM payment_receipts WHERE tracking_number='AUD-RBANK'),
  'audit reverse bank rec') AS rev_id;

SELECT 'R_BANK_EXP_AFTER' AS step, count(*) AS n
  FROM asan_list_journal_export(public.tehran_today(), public.tehran_today(), 'receipt') e
  JOIN journal_entries je ON je.id=e.doc_id
  JOIN payment_receipts pr ON pr.id=je.source_id WHERE pr.tracking_number='AUD-RBANK';

-- cheque receipt
SELECT 'R_CHQ' AS step, r.receipt_id, r.journal_entry_id
  FROM public.create_receipt(
    p_channel := 'cheque', p_customer_id := 'ce69632d-5426-4eee-9b46-0b2651e4005d',
    p_amount := 202000, p_payment_date := public.tehran_today(), p_payment_time := '11:00',
    p_cheque_number := 'AUD-CHQ-R', p_cheque_due_date := public.tehran_today() + 7,
    p_cheque_bank := 'mellat', p_description := 'audit chq rec') r;

SELECT 'R_CHQ_KIND' AS step, jl.account_kind, jl.debit, jl.credit
  FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id
  JOIN payment_receipts pr ON pr.id=je.source_id WHERE pr.cheque_number='AUD-CHQ-R' OR pr.tracking_number LIKE 'INT-%'
   AND je.entry_date=public.tehran_today() AND jl.debit>0
 ORDER BY jl.debit DESC LIMIT 4;

SELECT 'R_CHQ_EXP' AS step, blocked_reason IS NOT NULL AS blocked, doc_debit, doc_credit, line_no
  FROM asan_list_journal_export(public.tehran_today(), public.tehran_today(), 'receipt') e
  JOIN journal_entries je ON je.id=e.doc_id
  JOIN payment_receipts pr ON pr.id=je.source_id
 WHERE pr.description='audit chq rec' LIMIT 3;

-- bank payment
SELECT 'P_BANK' AS step, p.voucher_id, p.journal_entry_id, p.new_balance
  FROM public.create_payment(
    p_channel := 'bank', p_payee_type := 'supplier',
    p_payee_id := '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount := 203000, p_payment_date := public.tehran_today(),
    p_source_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_tracking_number := 'AUD-PBANK', p_description := 'audit bank pay') p;

SELECT 'P_BANK_JE' AS step, je.doc_kind,
       (SELECT sum(debit) FROM journal_lines WHERE journal_entry_id=je.id) AS dr,
       (SELECT sum(credit) FROM journal_lines WHERE journal_entry_id=je.id) AS cr
  FROM journal_entries je JOIN payment_vouchers pv ON pv.id=je.source_id
 WHERE pv.tracking_number='AUD-PBANK';

SELECT 'P_BANK_EXP' AS step, count(*) FROM asan_list_journal_export(public.tehran_today(), public.tehran_today(), 'payment') e
  JOIN journal_entries je ON je.id=e.doc_id
  JOIN payment_vouchers pv ON pv.id=je.source_id WHERE pv.tracking_number='AUD-PBANK';

SELECT 'P_BANK_REV' AS step, public.reverse_document(
  'payment', (SELECT id FROM payment_vouchers WHERE tracking_number='AUD-PBANK'),
  'audit reverse bank pay');

-- own cheque payment
SELECT 'P_OWN' AS step, p.voucher_id, p.journal_entry_id
  FROM public.create_payment(
    p_channel := 'cheque', p_payee_type := 'supplier',
    p_payee_id := '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount := 204000, p_payment_date := public.tehran_today(),
    p_source_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_cheque_kind := 'own', p_cheque_number := 'AUD-OWN',
    p_cheque_due_date := public.tehran_today() + 5, p_description := 'audit own chq') p;

SELECT 'P_OWN_KIND' AS step, jl.account_kind, jl.debit, jl.credit
  FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id
  JOIN payment_vouchers pv ON pv.id=je.source_id WHERE pv.description='audit own chq';

SELECT 'P_OWN_VW' AS step, total_out FROM vw_account_balances WHERE account_id='32a4c282-85a3-485c-bbb4-dae3bb4febd6';

-- dual
SELECT 'DUAL' AS step, d.document_id, d.journal_entry_id
  FROM public.create_dual_document(
    p_payer_type := 'customer', p_payer_id := '9685a046-9d89-4573-b204-239955c7527e',
    p_beneficiary_type := 'supplier', p_beneficiary_id := '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount := 205000, p_document_date := public.tehran_today(),
    p_tracking_number := 'AUD-DUAL', p_description := 'audit dual',
    p_transferrer_name := 'father', p_recipient_name := 'mitra') d;

SELECT 'DUAL_JE' AS step, je.doc_kind, (SELECT count(*) FROM journal_lines WHERE journal_entry_id=je.id) AS n,
       (SELECT sum(debit) FROM journal_lines WHERE journal_entry_id=je.id) AS dr,
       (SELECT sum(credit) FROM journal_lines WHERE journal_entry_id=je.id) AS cr
  FROM journal_entries je JOIN dual_documents dd ON dd.id=je.source_id WHERE dd.tracking_number='AUD-DUAL';

SELECT 'DUAL_EXP_TP' AS step, count(*) FROM asan_list_journal_export(public.tehran_today(), public.tehran_today(), 'third_party') e
  JOIN journal_entries je ON je.id=e.doc_id
  JOIN dual_documents dd ON dd.id=je.source_id WHERE dd.tracking_number='AUD-DUAL';

SELECT 'DUAL_REV' AS step, public.reverse_document(
  'dual', (SELECT id FROM dual_documents WHERE tracking_number='AUD-DUAL'),
  'audit reverse dual');

-- sales 42501
SELECT set_config('request.jwt.claims',
  '{"sub":"6923d664-ef08-48f0-ba0c-cb3bf0106cf7","role":"authenticated"}', true);
DO $$
BEGIN
  PERFORM * FROM public.create_receipt(
    p_channel := 'bank', p_customer_id := '9685a046-9d89-4573-b204-239955c7527e',
    p_amount := 1, p_payment_date := public.tehran_today(), p_payment_time := '10:00',
    p_destination_bank_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_tracking_number := 'AUD-SALES');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SALES_GATE sqlstate=%', SQLSTATE;
END $$;
