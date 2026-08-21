SELECT to_regclass('public.payments') AS payments;
SELECT to_regclass('public.ocr_receipts') AS ocr_receipts;
SELECT to_regclass('public.invoice_items') AS invoice_items;
SELECT to_regclass('public.waybill_items') AS waybill_items;
SELECT to_regclass('public.waybill_custom_fields') AS waybill_custom_fields;
SELECT to_regclass('public.price_list_items') AS price_list_items;
SELECT to_regclass('public.promotion_nominations') AS promotion_nominations;

SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'cancel_promotion_nomination',
    'complete_marketing_task',
    'generate_marketing_tasks',
    'get_promotion_nomination_quota',
    'get_task_kpi_report',
    'nominate_product_for_promotion',
    'start_league_season',
    'get_current_league'
  )
ORDER BY 1;
