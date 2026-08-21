SELECT to_regclass('public.invoices') AS invoices_regclass;
SELECT to_regclass('public.invoice_items') AS invoice_items_regclass;
SELECT to_regclass('public.waybills') AS waybills_regclass;
SELECT to_regclass('public.price_lists') AS price_lists_regclass;
SELECT to_regclass('public.promotion_nominations') AS promotion_nominations_regclass;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'league_seasons'
ORDER BY ordinal_position;

SELECT p.proname,
       (pg_get_functiondef(p.oid) LIKE '%title_fa%') AS def_mentions_title_fa
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('start_league_season', 'settle_league_season', 'validate_league_season', 'auto_submit_penalty', 'tick_inquiries', 'expire_pending_documents', 'person_merge');

SELECT (pg_get_functiondef(p.oid) LIKE '%mutual_settlements.person_id%') AS merge_has_mutual
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'person_merge';

SELECT (pg_get_functiondef(p.oid) LIKE '%WHERE source_table IS NOT NULL%') AS auto_penalty_has_partial_predicate
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'auto_submit_penalty';
