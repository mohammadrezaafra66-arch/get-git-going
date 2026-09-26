-- R6 test data counts. ASCII. No secret rows.
SET client_encoding TO 'UTF8';

SELECT public.tehran_today() AS tehran_today;

SELECT
  (SELECT count(*) FROM public.products p WHERE p.is_active) AS active_products,
  (SELECT count(*) FROM public.products p
    WHERE p.is_active AND p.torob_url IS NOT NULL AND btrim(p.torob_url) <> '') AS active_with_torob_url,
  (SELECT count(*) FROM public.products p
    WHERE p.is_active
      AND EXISTS (
        SELECT 1
        FROM public.product_computed_prices_public pcp
        JOIN public.sale_price_types spt ON spt.id = pcp.sale_price_type_id
        WHERE pcp.product_id = p.id
          AND spt.code = 'cash_price'
          AND pcp.rounded_sale_price IS NOT NULL
          AND pcp.rounded_sale_price > 0
      )
  ) AS active_with_computed_base;

SELECT count(*) AS own_shops FROM public.torob_ops_own_shops;
SELECT count(*) AS accounts FROM public.torob_ops_accounts;
SELECT count(*) AS credentials FROM public.torob_ops_credentials;
SELECT auto_report_enabled, kill_switch FROM public.torob_ops_settings;

SELECT
  count(*) AS nq_total,
  max(created_at) AS nq_max_created,
  count(*) FILTER (WHERE is_read) AS nq_read,
  count(*) FILTER (WHERE NOT is_read) AS nq_unread
FROM public.notification_queue;

SELECT type, count(*) AS n, max(created_at) AS max_created
FROM public.notification_queue
GROUP BY type
ORDER BY max_created DESC;

SELECT id, type, is_read, created_at, read_at
FROM public.notification_queue
ORDER BY created_at DESC
LIMIT 5;

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name ILIKE '%notif%'
ORDER BY table_name;

SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.notification_queue'::regclass
  AND contype = 'c';
