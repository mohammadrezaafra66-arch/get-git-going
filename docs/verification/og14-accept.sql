SET client_encoding = 'UTF8';
\pset pager off
\o /tmp/og14-accept.out

BEGIN;

SELECT set_config('request.jwt.claims',
  '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}', true);

SELECT 'CREDIT_BEFORE' AS step, g.available_credit
  FROM public.get_customer_credit('9685a046-9d89-4573-b204-239955c7527e') g;

SELECT 'LINK_BEFORE' AS step,
       coalesce(sum(l.amount),0) AS linked
  FROM public.payment_receipt_links l
 WHERE l.quote_id = '2a38bcc3-e7e0-48d5-95ef-725a75047b85';

SELECT 'R1_CREATE' AS step, r.receipt_id, r.document_number, r.journal_entry_id, r.new_balance
  FROM public.create_receipt(
    p_channel := 'bank',
    p_customer_id := '9685a046-9d89-4573-b204-239955c7527e',
    p_amount := 1000000,
    p_payment_date := public.tehran_today(),
    p_payment_time := '10:00',
    p_destination_bank_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_tracking_number := 'OG14-R1',
    p_description := 'آزمون برگشت فیش',
    p_allocations := '[{"quote_id":"2a38bcc3-e7e0-48d5-95ef-725a75047b85","amount":1000000}]'::jsonb
  ) r;

SELECT 'CREDIT_AFTER_CREATE' AS step, g.available_credit
  FROM public.get_customer_credit('9685a046-9d89-4573-b204-239955c7527e') g;

SELECT 'LINK_AFTER_CREATE' AS step, coalesce(sum(l.amount),0) AS linked
  FROM public.payment_receipt_links l
 WHERE l.quote_id = '2a38bcc3-e7e0-48d5-95ef-725a75047b85';

-- m2: empty and whitespace reason must refuse before any reverse
DO $t$
DECLARE _sqlstate text;
BEGIN
  BEGIN
    PERFORM public.reverse_document(
      'receipt',
      (SELECT id FROM public.payment_receipts WHERE tracking_number = 'OG14-R1'),
      '');
    RAISE NOTICE 'EMPTY_REASON unexpected success';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _sqlstate = RETURNED_SQLSTATE;
    RAISE NOTICE 'EMPTY_REASON sqlstate=%', _sqlstate;
  END;
  BEGIN
    PERFORM public.reverse_document(
      'receipt',
      (SELECT id FROM public.payment_receipts WHERE tracking_number = 'OG14-R1'),
      '   ');
    RAISE NOTICE 'WS_REASON unexpected success';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _sqlstate = RETURNED_SQLSTATE;
    RAISE NOTICE 'WS_REASON sqlstate=%', _sqlstate;
  END;
END;
$t$;

SELECT 'R1_REVERSE' AS step, public.reverse_document(
  'receipt',
  (SELECT id FROM public.payment_receipts WHERE tracking_number = 'OG14-R1'),
  'اشتباه در ثبت فیش آزمون'
) AS reversal_entry_id;

SELECT 'R1_ORIG' AS step, je.status, je.reverses_entry_id IS NULL AS orig_not_a_reversal,
       pr.reversed_at IS NOT NULL AS marked
  FROM public.payment_receipts pr
  JOIN public.journal_entries je ON je.source_id = pr.id AND je.source_type = 'payment_receipt'
 WHERE pr.tracking_number = 'OG14-R1';

SELECT 'R1_REV_LINES' AS step, count(*) AS n, sum(jl.debit)=sum(jl.credit) AS balanced
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
 WHERE je.reverses_entry_id = (
   SELECT je2.id FROM public.journal_entries je2
   JOIN public.payment_receipts pr ON pr.id = je2.source_id AND je2.source_type='payment_receipt'
   WHERE pr.tracking_number = 'OG14-R1' AND je2.reverses_entry_id IS NULL
 );

SELECT 'CREDIT_AFTER_REV' AS step, g.available_credit
  FROM public.get_customer_credit('9685a046-9d89-4573-b204-239955c7527e') g;

SELECT 'LINK_AFTER_REV' AS step, coalesce(sum(l.amount),0) AS linked
  FROM public.payment_receipt_links l
 WHERE l.quote_id = '2a38bcc3-e7e0-48d5-95ef-725a75047b85';

-- 2 payment (bank, not cheque)
SELECT 'P1_CREATE' AS step, p.voucher_id, p.document_number, p.journal_entry_id
  FROM public.create_payment(
    p_channel := 'bank',
    p_payee_type := 'supplier',
    p_payee_id := '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount := 500000,
    p_payment_date := public.tehran_today(),
    p_source_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_tracking_number := 'OG14-P1',
    p_description := 'آزمون برگشت پرداخت'
  ) p;

SELECT 'P1_REVERSE' AS step, public.reverse_document(
  'payment',
  (SELECT id FROM public.payment_vouchers WHERE description = 'آزمون برگشت پرداخت' ORDER BY created_at DESC LIMIT 1),
  'اشتباه در ثبت پرداخت آزمون'
) AS reversal_entry_id;

SELECT 'P1_MARKED' AS step, reversed_at IS NOT NULL AS marked
  FROM public.payment_vouchers WHERE description = 'آزمون برگشت پرداخت'
 ORDER BY created_at DESC LIMIT 1;

-- 3 dual
SELECT 'D1_CREATE' AS step, d.document_id, d.document_number, d.journal_entry_id
  FROM public.create_dual_document(
    p_payer_type             := 'customer',
    p_payer_id               := 'ce69632d-5426-4eee-9b46-0b2651e4005d',
    p_beneficiary_type       := 'supplier',
    p_beneficiary_id         := '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount                 := 2000000,
    p_document_date          := public.tehran_today(),
    p_tracking_number        := 'OG14-D1',
    p_description            := 'آزمون برگشت دوطرفه'
  ) d;

SELECT 'D1_REVERSE' AS step, public.reverse_document(
  'dual',
  (SELECT id FROM public.dual_documents WHERE description = 'آزمون برگشت دوطرفه' ORDER BY created_at DESC LIMIT 1),
  'اشتباه در ثبت سند دوطرفه آزمون'
) AS reversal_entry_id;

SELECT 'D1_LINES' AS step, count(*) AS n, sum(jl.debit)=sum(jl.credit) AS balanced
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.dual_documents dd ON dd.reversal_journal_entry_id = je.id
 WHERE dd.description = 'آزمون برگشت دوطرفه';

-- 4 endorsement
SELECT 'CHQ_CREATE' AS step, r.receipt_id, r.document_number
  FROM public.create_receipt(
    p_channel := 'cheque',
    p_customer_id := 'ce69632d-5426-4eee-9b46-0b2651e4005d',
    p_amount := 300000,
    p_payment_date := public.tehran_today(),
    p_payment_time := '11:00',
    p_cheque_number := 'OG14-CHQ-1',
    p_cheque_due_date := public.tehran_today() + 10,
    p_cheque_bank := 'ملت',
    p_description := 'آزمون چک ظهرنویسی'
  ) r;

SELECT 'END_CREATE' AS step, p.voucher_id, p.document_number
  FROM public.create_payment(
    p_channel := 'cheque',
    p_payee_type := 'supplier',
    p_payee_id := '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount := 300000,
    p_payment_date := public.tehran_today(),
    p_source_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_cheque_kind := 'endorsed',
    p_endorsed_cheque_id := (SELECT id FROM public.payment_receipts WHERE cheque_number = 'OG14-CHQ-1'),
    p_description := 'آزمون ظهرنویسی برای برگشت'
  ) p;

SELECT 'END_REVERSE' AS step, public.reverse_document(
  'payment',
  (SELECT id FROM public.payment_vouchers WHERE description = 'آزمون ظهرنویسی برای برگشت' ORDER BY created_at DESC LIMIT 1),
  'ظهرنویسی اشتباه آزمون'
) AS reversal_entry_id;

SELECT 'END_FREE' AS step, p.voucher_id
  FROM public.create_payment(
    p_channel := 'cheque',
    p_payee_type := 'supplier',
    p_payee_id := '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount := 300000,
    p_payment_date := public.tehran_today(),
    p_source_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_cheque_kind := 'endorsed',
    p_endorsed_cheque_id := (SELECT id FROM public.payment_receipts WHERE cheque_number = 'OG14-CHQ-1'),
    p_description := 'ظهرنویسی دوباره پس از برگشت'
  ) p;

-- 5 double reverse
DO $t$
DECLARE _sqlstate text; _msg text;
BEGIN
  BEGIN
    PERFORM public.reverse_document(
      'receipt',
      (SELECT id FROM public.payment_receipts WHERE tracking_number = 'OG14-R1'),
      'تلاش دوم'
    );
    RAISE NOTICE 'DOUBLE_REV unexpected success';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _sqlstate = RETURNED_SQLSTATE, _msg = MESSAGE_TEXT;
    RAISE NOTICE 'DOUBLE_REV sqlstate=%', _sqlstate;
  END;
END;
$t$;

-- 6 original immutable
DO $t$
DECLARE _sqlstate text;
BEGIN
  BEGIN
    UPDATE public.journal_entries je
       SET description = 'tamper'
      FROM public.payment_receipts pr
     WHERE pr.tracking_number = 'OG14-R1'
       AND je.source_id = pr.id AND je.source_type = 'payment_receipt'
       AND je.reverses_entry_id IS NULL;
    RAISE NOTICE 'IMMUTABLE unexpected success rows=%', FOUND;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _sqlstate = RETURNED_SQLSTATE;
    RAISE NOTICE 'IMMUTABLE sqlstate=%', _sqlstate;
  END;
END;
$t$;

-- 7 roles
DO $t$
DECLARE _sqlstate text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00ebe9d3-b467-453c-89d6-08bab46335c2","role":"authenticated"}', true);
  BEGIN
    PERFORM public.reverse_document(
      'receipt',
      (SELECT id FROM public.payment_receipts WHERE tracking_number = 'OG14-R1'),
      'نقش فروش'
    );
    RAISE NOTICE 'SALES unexpected success';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _sqlstate = RETURNED_SQLSTATE;
    RAISE NOTICE 'SALES sqlstate=%', _sqlstate;
  END;
END;
$t$;

SELECT set_config('request.jwt.claims',
  '{"sub":"90c0479f-410d-4fff-9e00-34bbba1cce2b","role":"authenticated"}', true);

SELECT 'ACCT_CREATE' AS step, r.receipt_id
  FROM public.create_receipt(
    p_channel := 'bank',
    p_customer_id := 'ce69632d-5426-4eee-9b46-0b2651e4005d',
    p_amount := 10000,
    p_payment_date := public.tehran_today(),
    p_payment_time := '12:00',
    p_destination_bank_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_tracking_number := 'OG14-ACCT',
    p_description := 'آزمون حسابدار'
  ) r;

SELECT 'ACCT_REV' AS step, public.reverse_document(
  'receipt',
  (SELECT id FROM public.payment_receipts WHERE tracking_number = 'OG14-ACCT'),
  'برگشت توسط حسابدار'
) AS reversal_entry_id;

SELECT set_config('request.jwt.claims',
  '{"sub":"e534b94d-a1a5-4614-991f-f4803eace751","role":"authenticated"}', true);

SELECT 'MGR_CREATE' AS step, r.receipt_id
  FROM public.create_receipt(
    p_channel := 'bank',
    p_customer_id := 'ce69632d-5426-4eee-9b46-0b2651e4005d',
    p_amount := 10000,
    p_payment_date := public.tehran_today(),
    p_payment_time := '12:30',
    p_destination_bank_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_tracking_number := 'OG14-MGR',
    p_description := 'آزمون مدیر'
  ) r;

-- OG-22 / M3: manager may create, must not reverse (42501)
DO $t$
DECLARE _sqlstate text;
BEGIN
  BEGIN
    PERFORM public.reverse_document(
      'receipt',
      (SELECT id FROM public.payment_receipts WHERE tracking_number = 'OG14-MGR'),
      'برگشت توسط مدیر');
    RAISE NOTICE 'MGR_REV unexpected success';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _sqlstate = RETURNED_SQLSTATE;
    RAISE NOTICE 'MGR_REV sqlstate=%', _sqlstate;
  END;
END;
$t$;

SELECT 'AUDIT' AS step, count(*) AS n
  FROM public.audit_logs WHERE action = 'document_reversed';

ROLLBACK;
