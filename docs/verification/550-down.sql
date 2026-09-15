SET client_encoding TO 'UTF8';

-- 550-down: reverse work_test_reports (copy/staging only — never production).
-- Soft-history rows are DROPped with the table; do not run if you need the data.

DROP FUNCTION IF EXISTS public.work_submit_test_report(uuid, text, text, uuid, timestamptz);

DROP POLICY IF EXISTS work_test_reports_select ON public.work_test_reports;
DROP POLICY IF EXISTS work_test_reports_insert ON public.work_test_reports;
DROP POLICY IF EXISTS work_test_reports_update ON public.work_test_reports;
DROP POLICY IF EXISTS work_test_reports_delete ON public.work_test_reports;

DROP INDEX IF EXISTS public.idx_work_test_reports_item_active;
DROP INDEX IF EXISTS public.idx_work_test_reports_created;
DROP INDEX IF EXISTS public.idx_work_test_reports_item;

-- Destructive on purpose for reverse path — only on empty/copy DBs.
DROP TABLE IF EXISTS public.work_test_reports;
