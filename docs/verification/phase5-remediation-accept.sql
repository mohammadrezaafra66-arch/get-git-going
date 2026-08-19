-- phase5-remediation-accept.sql
-- Invoke the REAL asan_list_journal_export under a simulated JWT.
-- STATEMENTS intended to run inside BEGIN … ROLLBACK (this file has no COMMIT).
SET client_encoding = 'UTF8';
\pset pager off

SELECT set_config('request.jwt.claims',
  '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}', true);

-- 1. Live receipt filter: seed only
SELECT 'A1_RECEIPT_DOCS' AS step, count(DISTINCT doc_id) AS docs, count(*) AS n
  FROM public.asan_list_journal_export('2026-07-01','2026-08-31','receipt');
SELECT 'A1_OG14' AS step, count(*) AS n
  FROM public.asan_list_journal_export('2026-07-01','2026-08-31','all')
 WHERE doc_id IN (
   '2c972cd3-c440-4d76-9776-2c339b969f00',
   '51e00e30-b55e-4851-ae00-036a6930d29d');

-- 2. Create bank receipt, reverse, neither leg in any filter
SELECT 'A2_CREATE' AS step, r.receipt_id, r.journal_entry_id
  FROM public.create_receipt(
    p_channel := 'bank',
    p_customer_id := '9685a046-9d89-4573-b204-239955c7527e',
    p_amount := 444000,
    p_payment_date := public.tehran_today(),
    p_payment_time := '12:00',
    p_destination_bank_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_tracking_number := 'P5R-BANK-1',
    p_description := 'P5R bank then reverse'
  ) r;

SELECT 'A2_REVERSE' AS step, public.reverse_document(
  'receipt',
  (SELECT id FROM public.payment_receipts WHERE tracking_number = 'P5R-BANK-1'),
  'آزمون خروج برگشت از فایل آسان'
) AS reversal_entry_id;

SELECT 'A2_LEGS' AS step, f AS filt, count(*) AS n
  FROM (VALUES ('all'),('receipt'),('payment'),('third_party'),('purchase_and_settlement')) v(f)
  CROSS JOIN LATERAL public.asan_list_journal_export(public.tehran_today(), public.tehran_today(), f) e
  JOIN public.journal_entries je ON je.id = e.doc_id
 WHERE je.source_id IN (
         SELECT id FROM public.payment_receipts WHERE tracking_number = 'P5R-BANK-1'
       )
    OR je.reverses_entry_id IS NOT NULL AND je.entry_date = public.tehran_today()
    AND je.description LIKE '%P5R%'
 GROUP BY f;

-- 3. Cheque vs bank in the same range
SELECT 'A3_CHQ' AS step, r.receipt_id, r.journal_entry_id
  FROM public.create_receipt(
    p_channel := 'cheque',
    p_customer_id := 'ce69632d-5426-4eee-9b46-0b2651e4005d',
    p_amount := 300000,
    p_payment_date := public.tehran_today(),
    p_payment_time := '11:00',
    p_cheque_number := 'P5R-CHQ-1',
    p_cheque_due_date := public.tehran_today() + 10,
    p_cheque_bank := 'ملت',
    p_description := 'P5R cheque'
  ) r;

SELECT 'A3_CHQ_N' AS step, f AS filt, count(*) AS n
  FROM (VALUES ('all'),('receipt'),('payment'),('third_party'),('purchase_and_settlement')) v(f)
  CROSS JOIN LATERAL public.asan_list_journal_export(public.tehran_today(), public.tehran_today(), f) e
  JOIN public.journal_entries je ON je.id = e.doc_id
  JOIN public.payment_receipts pr ON pr.id = je.source_id
 WHERE pr.cheque_number = 'P5R-CHQ-1'
 GROUP BY f;

SELECT 'A3_BANK_STILL' AS step, count(*) AS n
  FROM public.asan_list_journal_export('2026-07-01','2026-08-31','receipt')
 WHERE doc_id = '6d6b1896-d7ce-433e-9908-27bae8b6c003';

-- 4. purchase_payment + settlement (replica insert — no committed test data)
SET LOCAL session_replication_role = replica;
INSERT INTO public.journal_entries (id, source_type, source_id, entry_date, description, status, doc_kind, posted_by)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'payment_voucher', 'bbbbbbbb-0000-0000-0000-0000000000aa',
   public.tehran_today(), 'P5R pp', 'posted', 'purchase_payment', '1a15e8c6-3a83-49c2-9531-db9046d30968'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'mutual_settlement', 'bbbbbbbb-0000-0000-0000-0000000000bb',
   public.tehran_today(), 'P5R setl', 'posted', 'settlement', '1a15e8c6-3a83-49c2-9531-db9046d30968'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'manual', 'bbbbbbbb-0000-0000-0000-0000000000cc',
   public.tehran_today(), 'P5R other', 'posted', 'other', '1a15e8c6-3a83-49c2-9531-db9046d30968');
INSERT INTO public.journal_lines (journal_entry_id, line_no, account_kind, account_ref_id, description, debit, credit)
VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 1, 'supplier_payable', '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6', 'pp', 5000, 0),
  ('bbbbbbbb-0000-0000-0000-000000000001', 2, 'bank', '32a4c282-85a3-485c-bbb4-dae3bb4febd6', 'pp', 0, 5000),
  ('bbbbbbbb-0000-0000-0000-000000000002', 1, 'customer_credit', 'ce69632d-5426-4eee-9b46-0b2651e4005d', 's', 3000, 0),
  ('bbbbbbbb-0000-0000-0000-000000000002', 2, 'supplier_payable', '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6', 's', 0, 3000),
  ('bbbbbbbb-0000-0000-0000-000000000003', 1, 'other', NULL, 'o', 1000, 0),
  ('bbbbbbbb-0000-0000-0000-000000000003', 2, 'bank', '32a4c282-85a3-485c-bbb4-dae3bb4febd6', 'o', 0, 1000);
SET LOCAL session_replication_role = DEFAULT;

SELECT 'A4_PP' AS step, f AS filt, count(*) AS n
  FROM (VALUES ('all'),('receipt'),('payment'),('third_party'),('purchase_and_settlement')) v(f)
  CROSS JOIN LATERAL public.asan_list_journal_export(public.tehran_today(), public.tehran_today(), f) e
 WHERE e.doc_id = 'bbbbbbbb-0000-0000-0000-000000000001'
 GROUP BY f ORDER BY 1;
SELECT 'A4_SETL' AS step, f AS filt, count(*) AS n
  FROM (VALUES ('all'),('receipt'),('payment'),('third_party'),('purchase_and_settlement')) v(f)
  CROSS JOIN LATERAL public.asan_list_journal_export(public.tehran_today(), public.tehran_today(), f) e
 WHERE e.doc_id = 'bbbbbbbb-0000-0000-0000-000000000002'
 GROUP BY f ORDER BY 1;
SELECT 'A4_PP_KIND' AS step, doc_kind FROM public.asan_list_journal_export(public.tehran_today(), public.tehran_today(), 'purchase_and_settlement')
 WHERE doc_id = 'bbbbbbbb-0000-0000-0000-000000000001' LIMIT 1;
SELECT 'A4_SETL_KIND' AS step, doc_kind FROM public.asan_list_journal_export(public.tehran_today(), public.tehran_today(), 'purchase_and_settlement')
 WHERE doc_id = 'bbbbbbbb-0000-0000-0000-000000000002' LIMIT 1;

-- 5. other: unclassified, blocked, Persian
SELECT 'A5_OTHER' AS step, f AS filt, count(*) AS n
  FROM (VALUES ('all'),('receipt'),('payment'),('third_party'),('purchase_and_settlement')) v(f)
  CROSS JOIN LATERAL public.asan_list_journal_export(public.tehran_today(), public.tehran_today(), f) e
 WHERE e.doc_id = 'bbbbbbbb-0000-0000-0000-000000000003'
 GROUP BY f;
SELECT 'A5_OTHER_BR' AS step, doc_kind, blocked_reason
  FROM public.asan_list_journal_export(public.tehran_today(), public.tehran_today(), 'all')
 WHERE doc_id = 'bbbbbbbb-0000-0000-0000-000000000003' LIMIT 1;

-- 7. bank deposit export undisturbed
SELECT 'A7_BANK' AS step, count(*) AS n
  FROM public.asan_list_bank_deposit_export('2026-07-01','2026-08-31');
SELECT 'A7_CONC' AS step, count(*) AS n
  FROM public.asan_list_bank_deposit_export('2026-07-01','2026-08-31') e
 WHERE e.doc_id IN (
   SELECT pr.id FROM public.payment_receipts pr WHERE pr.tracking_number = 'OG14-CONC');
