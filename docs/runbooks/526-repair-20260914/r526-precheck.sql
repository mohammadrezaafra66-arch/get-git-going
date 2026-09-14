-- r526-precheck.sql -- READ ONLY. Measures each of migration 526's nine repairs with the SAME
-- predicates 526 itself uses for its \gset need_* flags (copied verbatim from
-- supabase/migrations/20260913090000_526_catalogue_repair_absent_migration_effects.sql), then
-- REFUSES unless all nine are still needed. Runbook: docs/runbooks/526-repair-20260914.md,
-- Block 2. ASCII only.
--
--   targets missing  -> ERROR r526 STOP: target object(s) absent            psql exit 3
--   needs = 0        -> ERROR r526 REFUSE: all nine effects already present  psql exit 3
--   0 < needs < 9    -> ERROR r526 STOP: partial state                       psql exit 3
--   needs = 9        -> r526_precheck|targets_missing=0|needs=9|of=9|VERDICT=APPLY-NEEDED, exit 0
SET default_transaction_read_only = on;
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

-- 526's own precondition list (lines 51-76 of the migration), counted instead of raised.
SELECT count(*) AS targets_missing,
       coalesce(string_agg(x.what, ', '), 'none') AS missing_list
  FROM (
    SELECT 'view product_computed_prices_public' AS what WHERE to_regclass('public.product_computed_prices_public') IS NULL
    UNION ALL SELECT 'view v_promotion_suggestions' WHERE to_regclass('public.v_promotion_suggestions') IS NULL
    UNION ALL SELECT 'view vw_account_balances' WHERE to_regclass('public.vw_account_balances') IS NULL
    UNION ALL SELECT 'function create_purchase(15-arg)'
     WHERE to_regprocedure('public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text)') IS NULL
    UNION ALL SELECT 'function get_payables_list'
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='get_payables_list')
    UNION ALL SELECT 'function upsert_staff_daily_performance_metric'
     WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='upsert_staff_daily_performance_metric')
    UNION ALL SELECT 'policy sdpm_insert_privileged'
     WHERE NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='sdpm_insert_privileged' AND polrelid=to_regclass('public.staff_daily_performance_metrics'))
    UNION ALL SELECT 'policy sdpm_update_privileged'
     WHERE NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname='sdpm_update_privileged' AND polrelid=to_regclass('public.staff_daily_performance_metrics'))
    UNION ALL SELECT 'function asan_list_bank_deposit_export(date,date)' WHERE to_regprocedure('public.asan_list_bank_deposit_export(date,date)') IS NULL
    UNION ALL SELECT 'function expire_stale_credit_holds(integer,integer)' WHERE to_regprocedure('public.expire_stale_credit_holds(integer,integer)') IS NULL
  ) x \gset

SELECT (:targets_missing > 0) AS stop_missing,
       'r526_precheck|targets_missing=' || :targets_missing || '|missing=' || :'missing_list' || '|VERDICT=TARGET-ABSENT' AS line_missing \gset
\if :stop_missing
\echo :line_missing
DO $r526$ BEGIN RAISE EXCEPTION 'r526 STOP: target object(s) absent - 526 would abort on its precondition. Do not apply. Escalate.'; END $r526$;
\endif

-- The nine need flags. Each predicate is 526's own, character for character.
SELECT
  string_agg(f.name || '=' || f.need, ' ' ORDER BY f.ord) AS flags,
  count(*) FILTER (WHERE f.need) AS needs
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

\echo :flags
SELECT (:needs = 0) AS refuse_all, (:needs > 0 AND :needs < 9) AS stop_partial,
       'r526_precheck|targets_missing=0|needs=' || :needs || '|of=9|VERDICT=' ||
         CASE WHEN :needs = 0 THEN 'ALREADY-PRESENT' WHEN :needs < 9 THEN 'PARTIAL' ELSE 'APPLY-NEEDED' END AS line_verdict \gset
\if :refuse_all
\echo :line_verdict
DO $r526$ BEGIN RAISE EXCEPTION 'r526 REFUSE: all nine effects of 526 are already present. Do NOT apply. Nothing to do.'; END $r526$;
\endif
\if :stop_partial
\echo :line_verdict
DO $r526$ BEGIN RAISE EXCEPTION 'r526 STOP: only some of the nine effects are absent. This is not the rehearsed shape. Do not apply. Escalate.'; END $r526$;
\endif

-- Context the operator reads before applying (not a gate).
SELECT 'r526_context'
    || '|export_out_columns=' || (SELECT count(*) FROM pg_proc p, unnest(p.proargmodes) m
                                   WHERE p.oid = to_regprocedure('public.asan_list_bank_deposit_export(date,date)') AND m = 't')
    || '|export_anon_exec=' || has_function_privilege('anon', 'public.asan_list_bank_deposit_export(date,date)', 'EXECUTE')
    || '|expire_overloads=' || (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                 WHERE n.nspname = 'public' AND p.proname = 'expire_stale_credit_holds')
    || '|callers_of_expire=' || (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                  WHERE n.nspname = 'public' AND p.prosrc ~ 'expire_stale_credit_holds\s*\('
                                    AND p.proname <> 'expire_stale_credit_holds');
\echo :line_verdict
