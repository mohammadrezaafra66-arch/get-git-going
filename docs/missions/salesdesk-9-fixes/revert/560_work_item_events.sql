SET client_encoding = 'UTF8';
DROP TRIGGER IF EXISTS trg_work_items_log_events ON public.work_items;
DROP FUNCTION IF EXISTS public.work_items_log_events();
DROP TABLE IF EXISTS public.work_item_events;
