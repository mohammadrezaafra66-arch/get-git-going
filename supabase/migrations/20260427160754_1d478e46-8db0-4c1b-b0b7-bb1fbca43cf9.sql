-- Feedback Items table for Phase 9.3
CREATE TABLE IF NOT EXISTS public.feedback_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('bug','process_issue','improvement','operational')),
  description text NOT NULL,
  where_occurred text,
  impact text,
  suggestion text,
  attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','accepted','rejected','converted_to_task','closed')),
  submitted_by uuid NOT NULL,
  assigned_to uuid,
  response text,
  responded_by uuid,
  responded_at timestamptz,
  converted_task_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_status ON public.feedback_items(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON public.feedback_items(type);
CREATE INDEX IF NOT EXISTS idx_feedback_submitted ON public.feedback_items(submitted_by);
CREATE INDEX IF NOT EXISTS idx_feedback_assigned ON public.feedback_items(assigned_to);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.feedback_items_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feedback_items_updated_at ON public.feedback_items;
CREATE TRIGGER trg_feedback_items_updated_at
  BEFORE UPDATE ON public.feedback_items
  FOR EACH ROW EXECUTE FUNCTION public.feedback_items_set_updated_at();

-- RLS
ALTER TABLE public.feedback_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY fi_insert_own
  ON public.feedback_items
  FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY fi_select_own_or_admin_manager
  ON public.feedback_items
  FOR SELECT TO authenticated
  USING (
    submitted_by = auth.uid()
    OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role])
  );

CREATE POLICY fi_update_admin_manager
  ON public.feedback_items
  FOR UPDATE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

CREATE POLICY fi_delete_admin
  ON public.feedback_items
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));