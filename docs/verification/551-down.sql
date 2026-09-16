SET client_encoding TO 'UTF8';

-- 551-down: reverse work_taxonomies (copy/staging only — never production).
-- Seed rows are DROPped with the table; do not run if you need the data.

DROP POLICY IF EXISTS work_taxonomies_select ON public.work_taxonomies;
DROP POLICY IF EXISTS work_taxonomies_insert ON public.work_taxonomies;
DROP POLICY IF EXISTS work_taxonomies_update ON public.work_taxonomies;
DROP POLICY IF EXISTS work_taxonomies_delete ON public.work_taxonomies;

DROP TRIGGER IF EXISTS trg_work_taxonomies_updated_at ON public.work_taxonomies;

DROP INDEX IF EXISTS public.idx_work_taxonomies_kind_active_sort;
DROP INDEX IF EXISTS public.uq_work_taxonomies_kind_name_active;

-- Destructive on purpose for reverse path — only on empty/copy DBs.
DROP TABLE IF EXISTS public.work_taxonomies;
