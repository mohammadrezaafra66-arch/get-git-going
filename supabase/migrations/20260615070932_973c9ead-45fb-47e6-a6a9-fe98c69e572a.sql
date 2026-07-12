-- SAFETY: security hardening | removes anonymous reads and realtime broadcasts | non-destructive
-- ROLLBACK: Recreate the two anon read policies and add the tables back to the supabase_realtime publication if public share pages/live updates are explicitly re-approved.

-- Remove public/anonymous read policies for sale list price data.
DROP POLICY IF EXISTS "sale_list_items_public_read_published" ON public.sale_list_items;
DROP POLICY IF EXISTS "sale_lists_public_read_published" ON public.sale_lists;

-- Defense in depth: revoke direct Data API read grants from unauthenticated users.
REVOKE SELECT ON public.sale_list_items FROM anon;
REVOKE SELECT ON public.sale_lists FROM anon;

-- Remove sensitive tables from database change broadcasts. This preserves normal
-- table access through RLS while preventing broad realtime subscription leakage.
ALTER PUBLICATION supabase_realtime DROP TABLE public.sale_list_items;
ALTER PUBLICATION supabase_realtime DROP TABLE public.product_sale_price_history;
ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
ALTER PUBLICATION supabase_realtime DROP TABLE public.market_rate_ticks;