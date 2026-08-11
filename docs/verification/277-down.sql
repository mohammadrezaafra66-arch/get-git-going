SET client_encoding='UTF8';
-- ============================================================================
-- 277-down — rollback for phase 10 (recurring marketing tasks, requirement 224)
--
-- Deliberately NOT in supabase/migrations/ — it is an operator tool, not part
-- of the forward history.
--
-- This file contains NO BEGIN/COMMIT. Transaction control belongs to the
-- caller (phase 6 learned this the hard way: a COMMIT inside a down script,
-- when the script is \i-ed from a dry-run harness, commits the HARNESS's
-- transaction and everything that was meant to roll back is written).
--
-- Run it as:
--   docker cp docs/verification/277-down.sql afrakala-lan-db:/tmp/down277.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin \
--     -d afrakala -v ON_ERROR_STOP=1 --single-transaction -f /tmp/down277.sql
--
-- ⚠️ WHAT THIS DESTROYS
--   `marketing_task_templates` is dropped. Any recurring template the owner
--   configured is LOST and cannot be reconstructed from anywhere else. Export
--   it first if the templates matter:
--     \copy (SELECT * FROM public.marketing_task_templates) TO 'templates.csv' CSV HEADER
--
--   Task rows already generated are NOT deleted — they are ordinary `tasks`
--   rows and deleting them would destroy real completion history that already
--   fed people's scores. They simply become orphaned marketing tasks whose
--   reference_id no longer resolves.
--
-- ⚠️ WHAT THIS DELIBERATELY DOES NOT UNDO
--   The REVOKE of anon's INSERT/UPDATE/DELETE/TRUNCATE on `marketing_channels`
--   is NOT restored. That was a pre-existing security hole (Supabase default
--   privileges, same family as item 259), not something phase 10 needed.
--   Re-granting it would reopen a hole for no reason. If you genuinely want it
--   back, do it by hand and write down why.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Guard: the old status CHECK cannot be restored while 'expired' rows live.
--    Fail loudly here rather than half-way through.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.tasks WHERE status = 'expired';
  IF v_n > 0 THEN
    RAISE EXCEPTION
      'Cannot roll back 277: % task(s) still have status=''expired'', which the pre-277 CHECK forbids. Decide what those rows should become (''canceled'' is the closest pre-277 meaning) and update them first.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM public.tasks WHERE assigned_queue = 'marketing';
  IF v_n > 0 THEN
    RAISE EXCEPTION
      'Cannot roll back 277: % task(s) still have assigned_queue=''marketing''. Set them to NULL first.', v_n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Triggers and their functions
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_marketing_task_completed ON public.tasks;
DROP TRIGGER IF EXISTS trg_marketing_task_guard     ON public.tasks;
DROP FUNCTION IF EXISTS public.trg_marketing_task_completed();
DROP FUNCTION IF EXISTS public.trg_marketing_task_guard();

-- ---------------------------------------------------------------------------
-- 2) RPCs
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.complete_marketing_task(uuid);
DROP FUNCTION IF EXISTS public.generate_marketing_tasks(date);

-- ---------------------------------------------------------------------------
-- 3) Indexes added to `tasks`
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.uq_tasks_marketing_daily;
DROP INDEX IF EXISTS public.idx_tasks_marketing_due;

-- ---------------------------------------------------------------------------
-- 4) The template table (see the destruction warning above)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.marketing_task_templates;

-- ---------------------------------------------------------------------------
-- 5) Restore the two CHECK constraints exactly as they were before 277
--    (copied from pg_constraint on 2026-08-04, before the migration ran).
-- ---------------------------------------------------------------------------
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_queue_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_assigned_queue_check
  CHECK (((assigned_queue IS NULL) OR (assigned_queue = ANY (ARRAY['sales'::text, 'shipping'::text, 'store'::text, 'accounting'::text]))));

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'done'::text, 'blocked'::text, 'canceled'::text])));

-- ---------------------------------------------------------------------------
-- 6) Restore get_task_kpi_report to its pre-277 shape.
--    277 added an `expired_count` output column, which changes the signature,
--    so the 277 version must be dropped before the old one can come back.
--    The body is restored verbatim from the live snapshot captured before the
--    migration: docs/verification/pre-277/get_task_kpi_report.sql
--
--    Copy that snapshot into the container alongside this file and it will be
--    picked up here:
--      docker cp docs/verification/pre-277/get_task_kpi_report.sql \
--        afrakala-lan-db:/tmp/pre277_kpi.sql
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_task_kpi_report(integer);
\i /tmp/pre277_kpi.sql
REVOKE ALL ON FUNCTION public.get_task_kpi_report(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_task_kpi_report(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) The Tehran date helper. Dropped last, because step 6's snapshot does not
--    use it but steps 1-2 did.
--    ⚠️ If any LATER migration starts using public.tehran_today(), delete this
--    line — dropping it would break that migration's objects.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tehran_today();

SELECT 'down 277 complete' AS status;
