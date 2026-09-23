SET client_encoding='UTF8';

-- 560-down: reverse work_item_events (copy/staging only — never production).

DROP TRIGGER IF EXISTS trg_work_items_log_events ON public.work_items;
DROP FUNCTION IF EXISTS public.work_items_log_events();
DROP TRIGGER IF EXISTS trg_work_item_events_from_update ON public.work_items;
DROP FUNCTION IF EXISTS public.tg_work_item_events_from_update();

DROP POLICY IF EXISTS work_item_events_select ON public.work_item_events;

DROP INDEX IF EXISTS public.work_item_events_item_at_idx;
DROP INDEX IF EXISTS public.idx_work_item_events_item_at;
DROP INDEX IF EXISTS public.idx_work_item_events_event_at;

DROP TABLE IF EXISTS public.work_item_events;

DELETE FROM supabase_migrations.schema_migrations WHERE version IN ('20260921220000', '20260921120000');
