SET client_encoding = 'UTF8';
\set ON_ERROR_STOP on
SELECT set_config('request.jwt.claims',
  '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}', false);
SELECT public.reverse_document(
  'receipt',
  (SELECT id FROM public.payment_receipts WHERE tracking_number = 'OG14-CONC'),
  'هم‌زمانی آزمون برگشت'
) AS reversal_entry_id;
