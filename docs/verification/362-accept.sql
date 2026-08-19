SET client_encoding = 'UTF8';
\pset pager off
\o /tmp/362-accept.out

BEGIN;

SELECT set_config('request.jwt.claims',
  '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}', true);

SELECT 'A1_named' AS step, d.document_id, d.document_number, d.journal_entry_id
  FROM public.create_dual_document(
    p_payer_type             := 'customer',
    p_payer_id               := 'ce69632d-5426-4eee-9b46-0b2651e4005d',
    p_beneficiary_type       := 'supplier',
    p_beneficiary_id         := '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount                 := 20000000,
    p_document_date          := public.tehran_today(),
    p_tracking_number        := 'CORR-362-A1',
    p_description            := 'تصحیح فاز چهار — سناریوی مالک با نام انتقال‌دهنده و گیرنده',
    p_source_bank            := 'ملت',
    p_destination_bank       := 'صادرات',
    p_transferrer_name       := 'پدر خان‌محمدی',
    p_recipient_name         := 'میترا'
  ) d;

SELECT 'A1_row' AS step, dd.transferrer_name, dd.recipient_name, dd.tracking_number,
       dd.source_bank, dd.destination_bank, dd.amount
  FROM public.dual_documents dd
 WHERE dd.tracking_number = 'CORR-362-A1';

SELECT 'A1_lines' AS step, count(*) AS line_count,
       bool_and(jl.account_ref_id IN (
         'ce69632d-5426-4eee-9b46-0b2651e4005d'::uuid,
         '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6'::uuid
       )) AS every_line_is_an_account_holder,
       sum(jl.debit) AS debit_sum, sum(jl.credit) AS credit_sum,
       (sum(jl.debit) = sum(jl.credit)) AS balanced
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.dual_documents dd ON dd.id = je.source_id
 WHERE dd.tracking_number = 'CORR-362-A1';

SELECT 'A1_kinds' AS step, jl.line_no, jl.account_kind, jl.account_ref_id, jl.debit, jl.credit
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.dual_documents dd ON dd.id = je.source_id
 WHERE dd.tracking_number = 'CORR-362-A1'
 ORDER BY jl.line_no;

SELECT 'A2_omitted' AS step, d.document_id, d.document_number
  FROM public.create_dual_document(
    p_payer_type             := 'customer',
    p_payer_id               := 'ce69632d-5426-4eee-9b46-0b2651e4005d',
    p_beneficiary_type       := 'supplier',
    p_beneficiary_id         := '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount                 := 20000000,
    p_document_date          := public.tehran_today(),
    p_tracking_number        := 'CORR-362-A2',
    p_description            := 'تصحیح فاز چهار — فیش بدون نام انتقال‌دهنده و گیرنده'
  ) d;

SELECT 'A2_row' AS step, dd.transferrer_name IS NULL AS transferrer_null,
       dd.recipient_name IS NULL AS recipient_null
  FROM public.dual_documents dd
 WHERE dd.tracking_number = 'CORR-362-A2';

SELECT 'A2_lines' AS step, count(*) AS line_count
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.dual_documents dd ON dd.id = je.source_id
 WHERE dd.tracking_number = 'CORR-362-A2';

DO $$
DECLARE _n int; _sqlstate text; _msg text;
BEGIN
  BEGIN
    PERFORM * FROM public.create_dual_document(
      'customer'::text,
      'ce69632d-5426-4eee-9b46-0b2651e4005d'::uuid,
      'supplier'::text,
      '26d7b2e9-ef6f-4649-b82e-ec23be71cbe6'::uuid,
      20000000::numeric,
      public.tehran_today(),
      'CORR-362-FEE'::text,
      'should not resolve'::text,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::uuid, 1::numeric, 'payer'::text, NULL::uuid[]
    );
    RAISE EXCEPTION 'OLD_FEE_SIGNATURE_STILL_EXISTS';
  EXCEPTION
    WHEN undefined_function THEN
      GET STACKED DIAGNOSTICS _sqlstate = RETURNED_SQLSTATE, _msg = MESSAGE_TEXT;
      RAISE NOTICE 'A5_old_fee_params sqlstate=% msg=%', _sqlstate, _msg;
  END;
  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_dual_document';
  RAISE NOTICE 'A5_pg_proc_count=%', _n;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'expected exactly one create_dual_document, got %', _n;
  END IF;
END $$;

ROLLBACK;
\o
