SET client_encoding='UTF8';
BEGIN;
\i /tmp/mig281.sql
SELECT 'restrictive_policies' AS check, count(*) AS n FROM pg_policies
 WHERE schemaname='public' AND policyname='viewer_restricted';
SELECT 'viewer_modules_viewable' AS check, count(*) AS n FROM public.role_permissions
 WHERE role_name='viewer' AND can_view;
-- the eight wrapped views must still return rows for a privileged caller
SET LOCAL "request.jwt.claims" = '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}';
SELECT 'admin_sees_promotions' AS check, count(*) AS n FROM public.v_promotion_suggestions;
SELECT 'admin_sees_balances' AS check, count(*) AS n FROM public.vw_account_balances;
SELECT 'admin_sees_dyn_capital' AS check, count(*) AS n FROM public.v_dynamic_salesperson_capital_balances;
SELECT 'admin_is_viewer_only' AS check, public.is_viewer_only('1a15e8c6-3a83-49c2-9531-db9046d30968'::uuid)::text AS n;
SET LOCAL "request.jwt.claims" = '{"sub":"20303d30-ab9d-4fc6-be96-ec5db1dcb647","role":"authenticated"}';
SELECT 'viewer_is_viewer_only' AS check, public.is_viewer_only('20303d30-ab9d-4fc6-be96-ec5db1dcb647'::uuid)::text AS n;
SELECT 'viewer_sees_promotions' AS check, count(*) AS n FROM public.v_promotion_suggestions;
SELECT 'viewer_sees_balances' AS check, count(*) AS n FROM public.vw_account_balances;
ROLLBACK;
