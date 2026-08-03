SET client_encoding='UTF8';
-- ============================================================================
-- 277 — dry run + HARD GATE for phase 10 (recurring marketing tasks, req 224).
--
-- Run with:  psql -v ON_ERROR_STOP=1 -f 277-dryrun.sql
-- Everything happens inside ONE transaction that is ROLLED BACK at the end,
-- so no test row survives. This file deliberately contains its own
-- BEGIN/ROLLBACK because it is a harness, NOT a down script (phase 6 lesson:
-- a down script must never control the transaction).
--
-- Fixtures used (real rows on the LAN test database):
--   assignee  c2ba2cac-af73-4815-ace4-cd41fd30bebc  «ali hajrasoulii» (sales)
--   channel A 4f009d0f-54ef-4e02-9c25-72f790441620  «استاتوس واتس اپ …»
--   channel B 25cb1ab7-b198-4913-9734-d31b9827ab98  «… استوری روبیکا»
--   role group 'accountant' = 3 holders
-- ============================================================================

BEGIN;

\echo '=== applying migration 277 ==='
\i /tmp/mig277.sql

-- Act as a real admin for the whole harness. Note we stay on the superuser
-- ROLE deliberately: that bypasses RLS, so anything the gate still refuses is
-- refused by a TRIGGER, not merely by a policy. That is the stronger claim.
SET LOCAL "request.jwt.claims" = '{"sub":"48f7c9d5-096e-437e-af9b-9cb0be5deb8c","role":"authenticated"}';

\echo ''
\echo '=== G0 — timezone: Tehran vs server ==='
SELECT current_date          AS server_date_utc,
       public.tehran_today()  AS tehran_today,
       (now() AT TIME ZONE 'Asia/Tehran')::time(0) AS tehran_clock,
       (current_date IS DISTINCT FROM public.tehran_today()) AS dates_differ_right_now;

-- --------------------------------------------------------------------------
-- Templates
-- --------------------------------------------------------------------------
INSERT INTO public.marketing_task_templates
  (id, channel_id, title, description, assigned_to, recurs_on_days, created_by)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001',
   '4f009d0f-54ef-4e02-9c25-72f790441620',
   'GATE277 استوری روزانه', 'یک استوری از محصولات امروز بگذار',
   'c2ba2cac-af73-4815-ace4-cd41fd30bebc',
   ARRAY[0,1,2,3,4,5,6]::smallint[],
   '48f7c9d5-096e-437e-af9b-9cb0be5deb8c');

INSERT INTO public.marketing_task_templates
  (id, channel_id, title, assigned_role, recurs_on_days, created_by)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000002',
   '25cb1ab7-b198-4913-9734-d31b9827ab98',
   'GATE277 گروهی', 'accountant',
   ARRAY[0,1,2,3,4,5,6]::smallint[],
   '48f7c9d5-096e-437e-af9b-9cb0be5deb8c');

\echo ''
\echo '=== G1 — run the generation job TWICE for the same day ==='
\echo '--- run 1 ---'
SELECT public.generate_marketing_tasks() AS run1;
\echo '--- run 2 (must generate 0) ---'
SELECT public.generate_marketing_tasks() AS run2;

\echo '--- G1 assertion: exactly one set of tasks for today ---'
SELECT
  count(*)                                   AS tasks_today,
  count(*) FILTER (WHERE assigned_queue='marketing') AS queue_marketing,
  count(*) FILTER (WHERE proof_requirement='none')   AS no_proof_required,
  count(DISTINCT (reference_id, assigned_to))        AS distinct_template_assignee,
  (count(*) = count(DISTINCT (reference_id, assigned_to))) AS G1_no_duplicates
FROM public.tasks
WHERE reference_type='marketing_recurring_task' AND due_date = public.tehran_today();

\echo ''
\echo '=== G2 — group template fanned out to every accountant (1 person + 3 group = 4) ==='
SELECT
  (SELECT count(*) FROM public.tasks
    WHERE reference_type='marketing_recurring_task'
      AND due_date=public.tehran_today()
      AND reference_id='aaaaaaaa-0000-4000-8000-000000000001') AS person_template_tasks,
  (SELECT count(*) FROM public.tasks
    WHERE reference_type='marketing_recurring_task'
      AND due_date=public.tehran_today()
      AND reference_id='aaaaaaaa-0000-4000-8000-000000000002') AS group_template_tasks,
  (SELECT count(*) FROM public.user_roles WHERE role::text='accountant') AS accountant_holders;

\echo ''
\echo '=== G3 — completion feeds score + profile + leaderboard ==='
\echo '--- score BEFORE ---'
SELECT COALESCE((SELECT total_score FROM public.employee_scores
                  WHERE employee_id='c2ba2cac-af73-4815-ace4-cd41fd30bebc'), 0) AS score_before,
       (SELECT count(*) FROM public.employee_score_events
         WHERE employee_id='c2ba2cac-af73-4815-ace4-cd41fd30bebc'
           AND event_type='promotion_completed') AS promo_events_before;

-- The assignee ticks their OWN task (no manager approval, no evidence).
SET LOCAL "request.jwt.claims" = '{"sub":"c2ba2cac-af73-4815-ace4-cd41fd30bebc","role":"authenticated"}';
SELECT public.complete_marketing_task(
  (SELECT id FROM public.tasks
    WHERE reference_type='marketing_recurring_task'
      AND due_date=public.tehran_today()
      AND assigned_to='c2ba2cac-af73-4815-ace4-cd41fd30bebc'
    ORDER BY created_at LIMIT 1)
) AS completion_result;

\echo '--- score AFTER (must be higher, and a promotion_completed event must exist) ---'
SELECT (SELECT total_score FROM public.employee_scores
         WHERE employee_id='c2ba2cac-af73-4815-ace4-cd41fd30bebc') AS score_after,
       (SELECT count(*) FROM public.employee_score_events
         WHERE employee_id='c2ba2cac-af73-4815-ace4-cd41fd30bebc'
           AND event_type='promotion_completed') AS promo_events_after,
       (SELECT breakdown->'promotions_completed'->>'value' FROM public.employee_scores
         WHERE employee_id='c2ba2cac-af73-4815-ace4-cd41fd30bebc') AS kpi_value_in_breakdown,
       (SELECT breakdown->'promotions_completed'->>'contribution' FROM public.employee_scores
         WHERE employee_id='c2ba2cac-af73-4815-ace4-cd41fd30bebc') AS kpi_contribution;

\echo '--- G3b leaderboard shows the person ---'
SELECT employee_id, full_name, score, rank
FROM public.get_leaderboard_daily(NULL, NULL, NULL, 100, 0)
WHERE employee_id='c2ba2cac-af73-4815-ace4-cd41fd30bebc';

\echo ''
\echo '=== G9 — someone else cannot tick my task ==='
\echo '(runs HERE, before G4 expires everything: the first draft of this gate'
\echo ' ran after G4 and "passed" with «وظیفه یافت نشد» — it was selecting a'
\echo ' NULL id and proving nothing at all.)'
SELECT count(*) AS pending_today_available_for_this_test
FROM public.tasks
WHERE reference_type='marketing_recurring_task'
  AND due_date=public.tehran_today() AND status='pending';

SET LOCAL "request.jwt.claims" = '{"sub":"fb4ec894-0ea6-4955-8efc-7882279164a8","role":"authenticated"}';
SAVEPOINT sp_g9;
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.tasks
   WHERE reference_type='marketing_recurring_task'
     AND due_date=public.tehran_today()
     AND status='pending' LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'G9 INVALID — no pending task to test against';
  ELSE
    PERFORM public.complete_marketing_task(v_id);
    RAISE NOTICE 'G9 FAIL — a stranger ticked someone else''s task';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'G9 PASS — refused: %', SQLERRM;
END $$;
ROLLBACK TO SAVEPOINT sp_g9;

\echo ''
\echo '=== G15 — the unique index is a real backstop, not just the job being careful ==='
SET LOCAL "request.jwt.claims" = '{"sub":"48f7c9d5-096e-437e-af9b-9cb0be5deb8c","role":"authenticated"}';
SAVEPOINT sp_g15;
DO $$
DECLARE v_t record;
BEGIN
  SELECT * INTO v_t FROM public.tasks
   WHERE reference_type='marketing_recurring_task'
     AND due_date=public.tehran_today() LIMIT 1;
  INSERT INTO public.tasks
    (title, assigned_to, status, priority, due_date, reference_type, reference_id,
     assigned_queue, proof_requirement)
  VALUES (v_t.title, v_t.assigned_to, 'pending', 'normal', v_t.due_date,
          'marketing_recurring_task', v_t.reference_id, 'marketing', 'none');
  RAISE NOTICE 'G15 FAIL — a duplicate daily task was accepted';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'G15 PASS — duplicate refused by the unique index (23505)';
END $$;
ROLLBACK TO SAVEPOINT sp_g15;

\echo ''
\echo '=== G16 — generating a FUTURE day must not expire today''s live work ==='
\echo '(the first dry run failed this: run_tomorrow expired 7 rows, 3 of which'
\echo ' were today''s still-open tasks. Fixed with LEAST(v_date, tehran_today).)'
SELECT count(*) AS open_today_before FROM public.tasks
 WHERE reference_type='marketing_recurring_task'
   AND due_date=public.tehran_today() AND status IN ('pending','in_progress');
SELECT public.generate_marketing_tasks(public.tehran_today() + 5) AS run_far_future;
SELECT count(*) AS open_today_after FROM public.tasks
 WHERE reference_type='marketing_recurring_task'
   AND due_date=public.tehran_today() AND status IN ('pending','in_progress');

\echo ''
\echo '=== G4 — NO ROLLOVER ==='
SET LOCAL "request.jwt.claims" = '{"sub":"48f7c9d5-096e-437e-af9b-9cb0be5deb8c","role":"authenticated"}';
\echo '--- generate for YESTERDAY, leave it untouched ---'
SELECT public.generate_marketing_tasks(public.tehran_today() - 1) AS run_yesterday;

\echo '--- now run TOMORROW''s job: yesterday must expire, today+tomorrow untouched ---'
SELECT public.generate_marketing_tasks(public.tehran_today() + 1) AS run_tomorrow;

\echo '--- G4 assertion: one row per day, the old one expired and NOT carried forward ---'
SELECT due_date, status, count(*) AS n
FROM public.tasks
WHERE reference_type='marketing_recurring_task'
  AND reference_id='aaaaaaaa-0000-4000-8000-000000000001'
  AND due_date <= public.tehran_today() + 1
GROUP BY due_date, status
ORDER BY due_date;

\echo ''
\echo '=== G5 — an expired task can never be ticked ==='
SET LOCAL "request.jwt.claims" = '{"sub":"c2ba2cac-af73-4815-ace4-cd41fd30bebc","role":"authenticated"}';
SAVEPOINT sp_g5;
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.tasks
   WHERE reference_type='marketing_recurring_task' AND status='expired'
     AND assigned_to='c2ba2cac-af73-4815-ace4-cd41fd30bebc' LIMIT 1;
  PERFORM public.complete_marketing_task(v_id);
  RAISE NOTICE 'G5 FAIL — expired task was completed';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'G5 PASS — refused: %', SQLERRM;
END $$;
ROLLBACK TO SAVEPOINT sp_g5;

\echo ''
\echo '=== G6 — the rollover back door: moving due_date is refused ==='
\echo '(this is a DIRECT UPDATE as superuser, i.e. RLS fully bypassed —'
\echo ' so the refusal below comes from the trigger, not from a policy)'
SAVEPOINT sp_g6;
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.tasks
   WHERE reference_type='marketing_recurring_task' AND status='expired' LIMIT 1;
  UPDATE public.tasks SET due_date = public.tehran_today() WHERE id = v_id;
  RAISE NOTICE 'G6 FAIL — due_date was moved forward';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'G6 PASS — refused: %', SQLERRM;
END $$;
ROLLBACK TO SAVEPOINT sp_g6;

\echo ''
\echo '=== G7 — direct PATCH-style tick of a NON-today task is refused ==='
SAVEPOINT sp_g7;
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.tasks
   WHERE reference_type='marketing_recurring_task'
     AND due_date = public.tehran_today() + 1 LIMIT 1;
  UPDATE public.tasks SET status='done', completed_at=now() WHERE id = v_id;
  RAISE NOTICE 'G7 FAIL — a future-dated task was ticked';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'G7 PASS — refused: %', SQLERRM;
END $$;
ROLLBACK TO SAVEPOINT sp_g7;

\echo ''
\echo '=== G8 — a completed task cannot be un-ticked (no double scoring) ==='
SAVEPOINT sp_g8;
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.tasks
   WHERE reference_type='marketing_recurring_task' AND status='done' LIMIT 1;
  UPDATE public.tasks SET status='pending', completed_at=NULL WHERE id = v_id;
  RAISE NOTICE 'G8 FAIL — a done task was reopened';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'G8 PASS — refused: %', SQLERRM;
END $$;
ROLLBACK TO SAVEPOINT sp_g8;

\echo ''
\echo '=== G10 — inactive template stops generating ==='
SET LOCAL "request.jwt.claims" = '{"sub":"48f7c9d5-096e-437e-af9b-9cb0be5deb8c","role":"authenticated"}';
UPDATE public.marketing_task_templates SET is_active=false
 WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
SELECT public.generate_marketing_tasks(public.tehran_today() + 2) AS run_after_deactivate;
SELECT count(*) AS person_tasks_on_day_plus_2
FROM public.tasks
WHERE reference_type='marketing_recurring_task'
  AND reference_id='aaaaaaaa-0000-4000-8000-000000000001'
  AND due_date = public.tehran_today() + 2;

\echo ''
\echo '=== G11 — day-of-week filter actually filters ==='
UPDATE public.marketing_task_templates
   SET is_active=true,
       recurs_on_days = ARRAY[ (EXTRACT(DOW FROM public.tehran_today()+3)::int + 1) % 7 ]::smallint[]
 WHERE id='aaaaaaaa-0000-4000-8000-000000000001';
SELECT public.generate_marketing_tasks(public.tehran_today() + 3) AS run_wrong_dow;
SELECT count(*) AS should_be_zero
FROM public.tasks
WHERE reference_type='marketing_recurring_task'
  AND reference_id='aaaaaaaa-0000-4000-8000-000000000001'
  AND due_date = public.tehran_today() + 3;

\echo ''
\echo '=== G17 — deactivating the CHANNEL also stops generation ==='
UPDATE public.marketing_task_templates
   SET recurs_on_days = ARRAY[0,1,2,3,4,5,6]::smallint[]
 WHERE id='aaaaaaaa-0000-4000-8000-000000000002';
UPDATE public.marketing_channels SET is_active=false
 WHERE id='25cb1ab7-b198-4913-9734-d31b9827ab98';
SELECT public.generate_marketing_tasks(public.tehran_today() + 4) AS run_channel_off;
SELECT count(*) AS group_tasks_on_day_plus_4
FROM public.tasks
WHERE reference_type='marketing_recurring_task'
  AND reference_id='aaaaaaaa-0000-4000-8000-000000000002'
  AND due_date = public.tehran_today() + 4;
UPDATE public.marketing_channels SET is_active=true
 WHERE id='25cb1ab7-b198-4913-9734-d31b9827ab98';

\echo ''
\echo '=== G12 — KPI report knows the marketing queue and the expired status ==='
SELECT section, bucket_key, bucket_label, task_count, open_count, done_count,
       expired_count, overdue_count
FROM public.get_task_kpi_report(30)
WHERE (section='queue' AND bucket_key IN ('marketing','store','none'))
   OR (section='status')
   OR section='overall'
ORDER BY section, bucket_key;

\echo ''
\echo '=== G13 — anon privileges ==='
SELECT
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='marketing_task_templates' AND grantee='anon') AS anon_on_templates,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='marketing_channels' AND grantee='anon'
      AND privilege_type <> 'SELECT') AS anon_dml_on_channels;

\echo ''
\echo '=== G14 — the advisory lock exists and is per-day ==='
SELECT public.generate_marketing_tasks(public.tehran_today()) AS rerun_same_txn;

\echo ''
\echo '=== DRY RUN OK — rolling back ==='
ROLLBACK;
