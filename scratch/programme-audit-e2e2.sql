BEGIN;
SET client_encoding='UTF8';
SELECT set_config('request.jwt.claims',
  '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}', true);

-- endorsement consume-once
SELECT 'CHQ' AS s, r.receipt_id FROM public.create_receipt(
  p_channel:='cheque', p_customer_id:='ce69632d-5426-4eee-9b46-0b2651e4005d',
  p_amount:=300000, p_payment_date:=public.tehran_today(), p_payment_time:='09:00',
  p_cheque_number:='AUD-END', p_cheque_due_date:=public.tehran_today()+3,
  p_description:='audit endorse') r;

SELECT 'END1' AS s, p.voucher_id FROM public.create_payment(
  p_channel:='cheque', p_payee_type:='supplier', p_payee_id:='26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
  p_amount:=300000, p_payment_date:=public.tehran_today(),
  p_source_account_id:='32a4c282-85a3-485c-bbb4-dae3bb4febd6',
  p_cheque_kind:='endorsed',
  p_endorsed_cheque_id:=(SELECT id FROM payment_receipts WHERE description='audit endorse'),
  p_description:='audit end1') p;

DO $$
BEGIN
  PERFORM * FROM public.create_payment(
    p_channel:='cheque', p_payee_type:='supplier', p_payee_id:='26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount:=300000, p_payment_date:=public.tehran_today(),
    p_source_account_id:='32a4c282-85a3-485c-bbb4-dae3bb4febd6',
    p_cheque_kind:='endorsed',
    p_endorsed_cheque_id:=(SELECT id FROM payment_receipts WHERE description='audit endorse'),
    p_description:='audit end2');
  RAISE NOTICE 'END2_OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'END2 sqlstate=%', SQLSTATE;
END $$;

-- cash payment no box
DO $$
BEGIN
  PERFORM * FROM public.create_payment(
    p_channel:='cash', p_payee_type:='supplier', p_payee_id:='26d7b2e9-ef6f-4649-b82e-ec23be71cbe6',
    p_amount:=1000, p_payment_date:=public.tehran_today(),
    p_source_account_id:='32a4c282-85a3-485c-bbb4-dae3bb4febd6');
  RAISE NOTICE 'CASH_PAY_OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'CASH_PAY sqlstate=% msg=%', SQLSTATE, left(SQLERRM,90);
END $$;

-- manager reverse
SELECT set_config('request.jwt.claims',
  '{"sub":"e534b94d-a1a5-4614-991f-f4803eace751","role":"authenticated"}', true);
DO $$
DECLARE _id uuid;
BEGIN
  SELECT id INTO _id FROM payment_receipts WHERE tracking_number='OG14-CONC';
  PERFORM public.reverse_document('receipt', _id, 'mgr');
  RAISE NOTICE 'MGR_REV_OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'MGR_REV sqlstate=%', SQLSTATE;
END $$;

-- posted immutable
DO $$
BEGIN
  UPDATE journal_entries SET description='x' WHERE status='posted';
  RAISE NOTICE 'IMM_OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'IMM sqlstate=%', SQLSTATE;
END $$;

-- numbering idempotency
SELECT set_config('request.jwt.claims',
  '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}', true);
SELECT 'NUM_EQ' AS s,
  public.assign_document_number('receipt','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  = public.assign_document_number('receipt','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') AS same;

ROLLBACK;
