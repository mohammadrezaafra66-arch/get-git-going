-- phase6-accept.sql — invoke REAL RPCs under JWT. Run inside BEGIN … ROLLBACK.
SET client_encoding = 'UTF8';
\pset pager off

SELECT set_config('request.jwt.claims',
  '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}', true);

SELECT 'P6_R_CREATE' AS step, r.receipt_id, r.document_number, r.journal_entry_id
  FROM public.create_receipt(
    p_channel := 'bank',
    p_customer_id := '9685a046-9d89-4573-b204-239955c7527e',
    p_amount := 111000,
    p_payment_date := public.tehran_today(),
    p_payment_time := '12:00',
    p_destination_bank_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_tracking_number := 'P6-BANK-R1',
    p_description := 'P6 wizard accept receipt'
  ) r;

SELECT 'P6_R_JE' AS step, je.doc_kind, je.status,
       (SELECT coalesce(sum(debit),0) FROM public.journal_lines WHERE journal_entry_id = je.id) AS debit,
       (SELECT coalesce(sum(credit),0) FROM public.journal_lines WHERE journal_entry_id = je.id) AS credit
  FROM public.journal_entries je
  JOIN public.payment_receipts pr ON pr.id = je.source_id
 WHERE pr.tracking_number = 'P6-BANK-R1';

SELECT 'P6_P_CREATE' AS step, p.voucher_id, p.document_number, p.journal_entry_id
  FROM public.create_payment(
    p_channel := 'bank',
    p_payee_type := 'supplier',
    p_payee_id := '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount := 122000,
    p_payment_date := public.tehran_today(),
    p_source_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_tracking_number := 'P6-BANK-P1',
    p_description := 'P6 wizard accept payment'
  ) p;

SELECT 'P6_P_JE' AS step, je.doc_kind, je.status,
       (SELECT coalesce(sum(debit),0) FROM public.journal_lines WHERE journal_entry_id = je.id) AS debit,
       (SELECT coalesce(sum(credit),0) FROM public.journal_lines WHERE journal_entry_id = je.id) AS credit
  FROM public.journal_entries je
  JOIN public.payment_vouchers pv ON pv.id = je.source_id
 WHERE pv.tracking_number = 'P6-BANK-P1' OR pv.description = 'P6 wizard accept payment';

SELECT 'P6_D_CREATE' AS step, d.document_id, d.document_number, d.journal_entry_id
  FROM public.create_dual_document(
    p_payer_type := 'customer',
    p_payer_id := '9685a046-9d89-4573-b204-239955c7527e',
    p_beneficiary_type := 'supplier',
    p_beneficiary_id := '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount := 133000,
    p_document_date := public.tehran_today(),
    p_tracking_number := 'P6-DUAL-1',
    p_description := 'P6 wizard accept dual'
  ) d;

SELECT 'P6_D_JE' AS step, je.doc_kind, je.status,
       (SELECT count(*) FROM public.journal_lines WHERE journal_entry_id = je.id) AS n_lines,
       (SELECT coalesce(sum(debit),0) FROM public.journal_lines WHERE journal_entry_id = je.id) AS debit,
       (SELECT coalesce(sum(credit),0) FROM public.journal_lines WHERE journal_entry_id = je.id) AS credit
  FROM public.journal_entries je
  JOIN public.dual_documents dd ON dd.id = je.source_id
 WHERE dd.tracking_number = 'P6-DUAL-1';
