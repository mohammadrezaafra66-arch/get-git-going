SET client_encoding='UTF8';

-- ============================================================================
-- 560 - public.work_item_events: field-level history for Calm Mind tickets (A3)
-- ============================================================================
-- Tracks status, assignee_id, priority, title, body on UPDATE of work_items.
-- INSERT into events is trigger-only (SECURITY DEFINER); authenticated SELECT
-- mirrors work_items visibility.
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/560_work_item_events.sql
-- ============================================================================

SET lock_timeout = '60s';

-- Drop any parallel logger (name collision from concurrent apply).
DROP TRIGGER IF EXISTS trg_work_items_log_events ON public.work_items;
DROP FUNCTION IF EXISTS public.work_items_log_events();
DROP TRIGGER IF EXISTS trg_work_item_events_from_update ON public.work_items;
DROP FUNCTION IF EXISTS public.tg_work_item_events_from_update();

CREATE TABLE IF NOT EXISTS public.work_item_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id  uuid NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  actor_id      uuid NULL,
  event_at      timestamptz NOT NULL DEFAULT now(),
  field         text NOT NULL,
  old_value     text NULL,
  new_value     text NULL
);

COMMENT ON TABLE public.work_item_events IS
  'Calm Mind ticket field history. Rows written only by trg_work_items_log_events.';

CREATE INDEX IF NOT EXISTS work_item_events_item_at_idx
  ON public.work_item_events (work_item_id, event_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_item_events_event_at
  ON public.work_item_events (event_at DESC);

ALTER TABLE public.work_item_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_item_events_select ON public.work_item_events;
CREATE POLICY work_item_events_select ON public.work_item_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_items wi
      WHERE wi.id = work_item_id
        AND (
          public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
          OR wi.creator_id = auth.uid()
          OR wi.assignee_id = auth.uid()
        )
    )
  );

REVOKE ALL ON TABLE public.work_item_events FROM PUBLIC;
REVOKE ALL ON TABLE public.work_item_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.work_item_events FROM authenticated;
GRANT SELECT ON TABLE public.work_item_events TO authenticated;
GRANT ALL ON TABLE public.work_item_events TO service_role;

CREATE OR REPLACE FUNCTION public.work_items_log_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.work_item_events (work_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'status', OLD.status::text, NEW.status::text);
  END IF;
  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
    INSERT INTO public.work_item_events (work_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'assignee_id', OLD.assignee_id::text, NEW.assignee_id::text);
  END IF;
  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.work_item_events (work_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'priority', OLD.priority::text, NEW.priority::text);
  END IF;
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO public.work_item_events (work_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'title', OLD.title::text, NEW.title::text);
  END IF;
  IF OLD.body IS DISTINCT FROM NEW.body THEN
    INSERT INTO public.work_item_events (work_item_id, actor_id, field, old_value, new_value)
    VALUES (NEW.id, v_actor, 'body', OLD.body::text, NEW.body::text);
  END IF;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.work_items_log_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.work_items_log_events() FROM anon;
GRANT EXECUTE ON FUNCTION public.work_items_log_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.work_items_log_events() TO service_role;

DROP TRIGGER IF EXISTS trg_work_items_log_events ON public.work_items;
CREATE TRIGGER trg_work_items_log_events
  AFTER UPDATE ON public.work_items
  FOR EACH ROW
  EXECUTE FUNCTION public.work_items_log_events();
