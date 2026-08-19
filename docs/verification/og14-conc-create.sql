SET client_encoding = 'UTF8';
\set ON_ERROR_STOP on
SELECT set_config('request.jwt.claims',
  '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}', false);
SELECT r.receipt_id FROM public.create_receipt(
  p_channel := 'bank',
  p_customer_id := 'ce69632d-5426-4eee-9b46-0b2651e4005d',
  p_amount := 10000,
  p_payment_date := public.tehran_today(),
  p_payment_time := '13:00',
  p_destination_bank_account_id := '32a4c282-85a3-485c-bbb4-dae3bb4febd6',
  p_tracking_number := 'OG14-CONC',
  p_description := 'OG14_CONC_do_not_keep'
) r;
