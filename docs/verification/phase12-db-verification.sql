SET client_encoding='UTF8';
\pset pager off
-- ============================================================================
-- PHASE 12 step 4 — mission-wide database verification.
-- Read-only except where a write is deliberately ATTEMPTED and must be refused;
-- every such attempt is wrapped in a SAVEPOINT and rolled back.
-- Run inside a transaction that is rolled back at the end.
-- ============================================================================
BEGIN;

\echo '=== 1. persons RLS — a salesperson must not read an unowned customer identifiers ==='
-- salesperson-a owns «تست ماهرو»; «تست ۲.۱» belongs to a different salesperson.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"ea9b35dd-0000-0000-0000-000000000000","role":"authenticated"}';
RESET ROLE;
SELECT
  (SELECT count(*) FROM public.persons)              AS persons_total_as_superuser,
  (SELECT count(*) FROM public.person_identifiers)   AS identifiers_total_as_superuser;

\echo '--- with a real salesperson JWT under RLS ---'
DO $$
DECLARE v_sales uuid; v_p int; v_i int;
BEGIN
  SELECT ur.user_id INTO v_sales FROM public.user_roles ur
   WHERE ur.role::text='sales' ORDER BY ur.user_id LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_sales, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_p FROM public.persons;
  SELECT count(*) INTO v_i FROM public.person_identifiers;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'salesperson %: sees % persons, % identifiers (superuser sees all)', v_sales, v_p, v_i;
END $$;

\echo ''
\echo '=== 2. final_capital — a direct UPDATE must be rejected ==='
SAVEPOINT s2;
DO $$
BEGIN
  UPDATE public.daily_capital_snapshots SET final_capital = final_capital + 1
   WHERE id = (SELECT id FROM public.daily_capital_snapshots LIMIT 1);
  RAISE NOTICE '2. FAIL — final_capital was updated';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '2. PASS — refused: %', SQLERRM;
END $$;
ROLLBACK TO SAVEPOINT s2;

\echo ''
\echo '=== 3. external_parties.person_id — unique index present, duplicates 0 ==='
SELECT
  (SELECT count(*) FROM pg_indexes
    WHERE tablename='external_parties' AND indexdef ILIKE '%person_id%' AND indexdef ILIKE '%UNIQUE%') AS unique_indexes,
  (SELECT count(*) FROM (
     SELECT person_id FROM public.external_parties
      WHERE person_id IS NOT NULL AND is_active
      GROUP BY person_id HAVING count(*) > 1) d)                                                       AS active_duplicates,
  (SELECT count(*) FROM public.external_parties)                                                       AS total_rows;

\echo ''
\echo '=== 4. profiles.person_id — backfill count and unmatched ==='
SELECT count(*) AS profiles_total,
       count(person_id) AS with_person,
       count(*) - count(person_id) AS unmatched,
       (SELECT count(DISTINCT person_id) FROM public.profiles WHERE person_id IS NOT NULL) AS distinct_persons
FROM public.profiles;

\echo ''
\echo '=== 5. score thresholds — 4 bands, versioned, no overlap ==='
SELECT count(*) AS band_rows,
       count(DISTINCT valid_from) AS versions,
       min(lower(score_range)) AS min_score,
       max(upper(score_range)) AS max_score
FROM public.score_level_thresholds;
SELECT label_fa, score_range::text, valid_from, valid_to
FROM public.score_level_thresholds ORDER BY valid_from, lower(score_range) DESC;

\echo ''
\echo '=== 6. manual score — preview must equal the stored result ==='
-- preview_manual_score_adjustment is admin-only, and check 1 left a
-- salesperson JWT in place, so the claims must be switched back first.
SAVEPOINT s6;
DO $$
DECLARE v_emp uuid; v_admin uuid; v_preview numeric; v_actual numeric;
BEGIN
  SELECT ur.user_id INTO v_admin FROM public.user_roles ur
   WHERE ur.role::text='admin' ORDER BY ur.user_id LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  SELECT employee_id INTO v_emp FROM public.employee_score_events
   WHERE event_type='manual_adjustment' LIMIT 1;
  IF v_emp IS NULL THEN
    SELECT user_id INTO v_emp FROM public.user_roles WHERE role::text='sales' LIMIT 1;
  END IF;
  -- Return keys measured from the live function, not guessed:
  -- delta, amount, current, schedule, projected, decay_shape, employee_id,
  -- effect_months — and `projected` is an OBJECT, not a scalar.
  SELECT (public.preview_manual_score_adjustment(v_emp, 100, 6)
            -> 'projected' ->> 'total_score')::numeric
    INTO v_preview;

  -- The honest comparison is preview vs the score AFTER the entry is really
  -- recorded, through the same path the form uses. Safe here: the whole script
  -- runs in a transaction that is rolled back, and this block additionally
  -- rolls back to its own savepoint.
  INSERT INTO public.employee_score_events (employee_id, event_type, source_table, source_id, payload)
  VALUES (v_emp, 'manual_adjustment', 'phase12_verification', gen_random_uuid()::text,
          jsonb_build_object('amount', 100, 'effect_months', 6));
  SELECT (public.calculate_employee_score(v_emp) ->> 'total_score')::numeric INTO v_actual;
  RAISE NOTICE '6. preview=% actual=% identical=%', v_preview, v_actual,
    (v_preview IS NOT DISTINCT FROM v_actual);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '6. could not be measured: %', SQLERRM;
END $$;
ROLLBACK TO SAVEPOINT s6;

\echo ''
\echo '=== 7. line-level warehouse — 0 lines missing a warehouse where the DOCUMENT had one ==='
SELECT
  (SELECT count(*) FROM public.sales_quote_items i
     JOIN public.sales_quotes q ON q.id=i.quote_id
    WHERE q.warehouse_id IS NOT NULL AND i.warehouse_id IS NULL)  AS quote_lines_orphaned,
  (SELECT count(*) FROM public.purchase_items pi
     JOIN public.purchases p ON p.id=pi.purchase_id
    WHERE p.warehouse_id IS NOT NULL AND pi.warehouse_id IS NULL) AS purchase_lines_orphaned,
  (SELECT count(*) FROM public.sales_quote_items)                 AS quote_lines_total,
  (SELECT count(*) FROM public.purchase_items)                    AS purchase_lines_total;

\echo ''
\echo '=== 8. person_fk_drift_report() must be empty ==='
SELECT count(*) AS drift_rows FROM public.person_fk_drift_report();
SELECT * FROM public.person_fk_drift_report() LIMIT 10;

\echo ''
\echo '=== 9. credit numbers — sample of 8, compared against the phase-8.6 anchors ==='
-- Anchors recorded in PROGRESS.md phase 8.6:
--   خان محمدی        = 10,100,000,000
--   محمدزین الدین     =  3,000,000,000
-- Measured, not assumed: `customers` has NO credit column, and
-- `customer_credit_profile` is EMPTY (0 rows). The live numbers come from
-- customer_credit_balance via the read RPC get_customer_credit().
SELECT c.name,
       g.available_credit,
       g.held_credit,
       g.total_purchases,
       g.outstanding_balance
FROM public.customers c
CROSS JOIN LATERAL public.get_customer_credit(c.id) g
ORDER BY g.available_credit DESC NULLS LAST, c.name
LIMIT 8;

\echo ''
\echo '=== 10. phase 10 objects present and no leftover test data ==='
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('tehran_today','generate_marketing_tasks','complete_marketing_task')) AS phase10_functions,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.tasks'::regclass AND NOT tgisinternal) AS task_triggers,
  (SELECT count(*) FROM public.marketing_task_templates) AS templates,
  (SELECT count(*) FROM public.tasks) AS tasks,
  (SELECT count(*) FROM public.employee_score_events WHERE event_type='promotion_completed') AS promo_events,
  public.tehran_today() AS tehran_today,
  current_date AS server_date;

\echo ''
\echo '=== 11. DATA HYGIENE — mission row counts ==='
SELECT
  (SELECT count(*) FROM public.persons)          AS persons,
  (SELECT count(*) FROM public.customers)        AS customers,
  (SELECT count(*) FROM public.suppliers)        AS suppliers,
  (SELECT count(*) FROM public.external_parties) AS external_parties,
  (SELECT count(*) FROM public.profiles)         AS profiles,
  (SELECT count(*) FROM public.employee_score_events) AS score_events;

ROLLBACK;
