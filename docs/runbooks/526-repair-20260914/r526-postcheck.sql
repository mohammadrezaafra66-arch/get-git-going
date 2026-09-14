-- r526-postcheck.sql -- READ ONLY. After 526 committed: all nine need flags must be false, the
-- export must still be closed to anon, exactly one expire_stale_credit_holds signature, and the
-- ledger must be unchanged (526 never writes it). Exit 3 on any failure.
-- Runbook: docs/runbooks/526-repair-20260914.md, Block 6. ASCII only.
SET default_transaction_read_only = on;
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

SELECT
  count(*) FILTER (WHERE f.need) AS needs,
  string_agg(f.name || '=' || f.need, ' ' ORDER BY f.ord) AS flags
FROM (VALUES
  (1, 'need_386a', NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
       LEFT JOIN LATERAL pg_options_to_table(c.reloptions) o ON true
      WHERE ns.nspname = 'public' AND c.relname = 'product_computed_prices_public'
        AND o.option_name = 'security_invoker' AND lower(o.option_value) IN ('true','on'))),
  (2, 'need_386b', (NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
         LEFT JOIN LATERAL pg_options_to_table(c.reloptions) o ON true
        WHERE ns.nspname = 'public' AND c.relname = 'v_promotion_suggestions'
          AND o.option_name = 'security_invoker' AND lower(o.option_value) IN ('true','on'))
      OR right(pg_get_viewdef('public.v_promotion_suggestions'::regclass),
               length('WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));'))
           <> 'WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));')),
  (3, 'need_386c', right(pg_get_viewdef('public.vw_account_balances'::regclass),
          length('WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));'))
      <> 'WHERE ((uid() IS NOT NULL) AND (NOT is_viewer_only(uid())));'),
  (4, 'need_394', EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.oid = 'public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text)'::regprocedure
         AND (position('public.tehran_today()' in p.prosrc) = 0 OR p.prosrc ~ '>\s*CURRENT_DATE'))),
  (5, 'need_396a', EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'get_payables_list'
         AND (pg_get_functiondef(p.oid) ~* 'CURRENT_DATE' OR pg_get_functiondef(p.oid) !~* 'tehran_today'))),
  (6, 'need_396b', EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'upsert_staff_daily_performance_metric'
         AND (pg_get_functiondef(p.oid) ~* 'CURRENT_DATE' OR pg_get_functiondef(p.oid) !~* 'tehran_today'))),
  (7, 'need_396c', EXISTS (
      SELECT 1 FROM pg_policy pol
       WHERE pol.polrelid = 'public.staff_daily_performance_metrics'::regclass
         AND pol.polname IN ('sdpm_insert_privileged','sdpm_update_privileged')
         AND (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
              || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ~* 'CURRENT_DATE')),
  (8, 'need_404', EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'asan_list_bank_deposit_export'
         AND (NOT ('direction' = ANY (p.proargnames)) OR p.prosrc !~* 'combined'))),
  (9, 'need_409', EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'expire_stale_credit_holds' AND p.pronargs = 1))
) AS f(ord, name, need) \gset

SELECT has_function_privilege('anon', 'public.asan_list_bank_deposit_export(date,date)', 'EXECUTE')::text AS anon_exec,
       has_function_privilege('authenticated', 'public.asan_list_bank_deposit_export(date,date)', 'EXECUTE')::text AS auth_exec,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'expire_stale_credit_holds') AS expire_overloads,
       (SELECT count(*) FROM supabase_migrations.schema_migrations) AS ledger_rows,
       (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260913090000') AS row_526 \gset

\echo :flags
SELECT (:needs <> 0 OR :'anon_exec' = 'true' OR :'auth_exec' <> 'true' OR :expire_overloads <> 1 OR :row_526 <> 1) AS post_fail,
       'r526_postcheck|needs=' || :needs || '|of=9|export_anon_exec=' || :'anon_exec' || '|export_authenticated_exec=' || :'auth_exec'
         || '|expire_overloads=' || :expire_overloads || '|ledger_rows=' || :ledger_rows || '|row_526=' || :row_526 AS line_post \gset
\echo :line_post
\if :post_fail
DO $r526$ BEGIN RAISE EXCEPTION 'r526 POSTCHECK FAILED: see the r526_postcheck line above. Do not re-run 526 blindly. Escalate.'; END $r526$;
\endif
\echo 'r526_postcheck|VERDICT=ALL-NINE-PRESENT'
