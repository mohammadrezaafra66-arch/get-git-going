-- Stage 1 FIX A: save live view, helpers, policies, grants. No writes.
SET client_encoding TO 'UTF8';

SELECT pg_get_viewdef('public.product_computed_prices_public'::regclass, true) AS viewdef;

SELECT c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'product_computed_prices',
    'product_computed_prices_public',
    'sale_price_types'
  );

SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.proname IN ('uid', 'is_viewer_only');

SELECT p.proname, pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND p.proname IN ('uid', 'is_viewer_only')
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('product_computed_prices', 'product_computed_prices_public', 'sale_price_types')
ORDER BY tablename, policyname;

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('product_computed_prices', 'product_computed_prices_public', 'sale_price_types')
  AND grantee IN ('anon', 'authenticated', 'service_role', 'supabase_admin', 'authenticator')
ORDER BY table_name, grantee, privilege_type;

SELECT current_user, session_user;
SELECT count(*) AS public_view_n FROM public.product_computed_prices_public;
SELECT count(*) AS table_n FROM public.product_computed_prices;
