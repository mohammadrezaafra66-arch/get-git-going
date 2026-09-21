SET client_encoding = 'UTF8';

-- A3: work_item_events + history trigger
CREATE TABLE IF NOT EXISTS public.work_item_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid NOT NULL REFERENCES public.work_items(id) ON DELETE CASCADE,
  actor_id uuid NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  field text NOT NULL,
  old_value text NULL,
  new_value text NULL
);

CREATE INDEX IF NOT EXISTS work_item_events_item_at_idx
  ON public.work_item_events (work_item_id, event_at DESC);

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

-- No INSERT/UPDATE/DELETE policies for authenticated — only trigger writes
-- (SECURITY DEFINER function). Without DELETE policy, API delete removes nothing.

CREATE OR REPLACE FUNCTION public.work_items_log_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.work_item_events (work_item_id, actor_id, field, old_value, new_value)
      VALUES (NEW.id, v_actor, 'status', OLD.status::text, NEW.status::text);
    END IF;
    IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
      INSERT INTO public.work_item_events (work_item_id, actor_id, field, old_value, new_value)
      VALUES (NEW.id, v_actor, 'assignee', OLD.assignee_id::text, NEW.assignee_id::text);
    END IF;
    IF OLD.priority IS DISTINCT FROM NEW.priority THEN
      INSERT INTO public.work_item_events (work_item_id, actor_id, field, old_value, new_value)
      VALUES (NEW.id, v_actor, 'priority', OLD.priority::text, NEW.priority::text);
    END IF;
    IF OLD.title IS DISTINCT FROM NEW.title THEN
      INSERT INTO public.work_item_events (work_item_id, actor_id, field, old_value, new_value)
      VALUES (NEW.id, v_actor, 'title', OLD.title, NEW.title);
    END IF;
    IF OLD.body IS DISTINCT FROM NEW.body THEN
      INSERT INTO public.work_item_events (work_item_id, actor_id, field, old_value, new_value)
      VALUES (NEW.id, v_actor, 'body', OLD.body, NEW.body);
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_work_items_log_events ON public.work_items;
CREATE TRIGGER trg_work_items_log_events
  AFTER UPDATE ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.work_items_log_events();

GRANT SELECT ON public.work_item_events TO authenticated;
