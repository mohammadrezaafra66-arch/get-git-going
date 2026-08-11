-- M2 / R2.3-R2.5: profile every phone-bearing column in schema public.
-- Read-only.
SET client_encoding='UTF8';

WITH src AS (
  SELECT 'customers.phone'::text AS col, phone::text AS v FROM public.customers
  UNION ALL SELECT 'suppliers.phone', phone FROM public.suppliers
  UNION ALL SELECT 'external_parties.phone', phone FROM public.external_parties
  UNION ALL SELECT 'profiles.phone', phone FROM public.profiles
  UNION ALL SELECT 'visitors.phone', phone FROM public.visitors
  UNION ALL SELECT 'sales_quotes.customer_phone', customer_phone FROM public.sales_quotes
  UNION ALL SELECT 'payment_receipts.payer_phone', payer_phone FROM public.payment_receipts
  UNION ALL SELECT 'payment_receipts.receiver_phone', receiver_phone FROM public.payment_receipts
  UNION ALL SELECT 'waybills.sender_phone', sender_phone FROM public.waybills
  UNION ALL SELECT 'waybills.receiver_phone', receiver_phone FROM public.waybills
  UNION ALL SELECT 'stock_alert_requests.customer_phone', customer_phone FROM public.stock_alert_requests
  UNION ALL SELECT 'person_identifiers.value_raw(mobile)', value_raw
                FROM public.person_identifiers WHERE kind = 'mobile_e164'
),
tagged AS (
  SELECT col, v,
         CASE
           WHEN v IS NULL OR btrim(v) = ''            THEN 'empty'
           WHEN v ~ '[۰-۹]'                            THEN 'persian_digits'
           WHEN v ~ '[٠-٩]'                            THEN 'arabic_indic_digits'
           WHEN v ~ '^\+98[0-9]{10}$'                  THEN 'plus98'
           WHEN v ~ '^0098[0-9]{10}$'                  THEN 'zerozero98'
           WHEN v ~ '^09[0-9]{9}$'                     THEN 'leading0_mobile'
           WHEN v ~ '^9[0-9]{9}$'                      THEN 'no_leading0_mobile'
           WHEN v ~ '^0[1-8][0-9]{9}$'                 THEN 'leading0_landline'
           WHEN v ~ '[[:space:]]'                      THEN 'contains_space'
           WHEN v ~ '[-()]'                            THEN 'contains_separator'
           ELSE 'other'
         END AS fmt
  FROM src
)
SELECT col, fmt, count(*) AS n
  FROM tagged
 GROUP BY col, fmt
 ORDER BY col, n DESC;
