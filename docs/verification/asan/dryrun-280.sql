SET client_encoding='UTF8';
BEGIN;
\i /tmp/mig280.sql
SELECT 'after_up_legacy_tables' AS check, count(*) AS n FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('salesperson_capital_allocations','customer_capital_allocations');
SELECT 'after_up_dynamic_rows' AS check, count(*) AS n FROM public.salesperson_capital_allocations_dynamic;
SELECT 'after_up_drift' AS check, count(*) AS n FROM public.person_fk_drift_report();
\i /tmp/280down.sql
SELECT 'after_down_legacy_tables' AS check, count(*) AS n FROM information_schema.tables
 WHERE table_schema='public' AND table_name IN ('salesperson_capital_allocations','customer_capital_allocations');
SELECT 'after_down_legacy_funcs' AS check, count(*) AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname='public' AND p.proname IN ('compute_salesperson_capital_allocations','compute_customer_capital_allocations',
   'save_salesperson_capital_allocations','save_customer_capital_allocations','_archive_prior_allocations_on_active',
   '_validate_allocation_amounts','enforce_allocation_not_overridable','validate_customer_capital_alloc_override');
SELECT 'after_down_policies' AS check, count(*) AS n FROM pg_policies
 WHERE schemaname='public' AND tablename IN ('salesperson_capital_allocations','customer_capital_allocations');
ROLLBACK;
