ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS mission_type text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS condition_event_key text,
  ADD COLUMN IF NOT EXISTS condition_operator text,
  ADD COLUMN IF NOT EXISTS condition_value numeric,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS repeat_rule text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.missions ADD CONSTRAINT missions_mission_type_chk
    CHECK (mission_type IN ('daily','weekly','monthly','custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.missions ADD CONSTRAINT missions_repeat_rule_chk
    CHECK (repeat_rule IN ('none','daily','weekly','monthly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.missions ADD CONSTRAINT missions_condition_operator_chk
    CHECK (condition_operator IS NULL OR condition_operator IN ('>=','>','=','<=','<'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.missions ADD CONSTRAINT missions_dates_chk
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS missions_definition_uniq
  ON public.missions (mission_type, condition_event_key, condition_operator, condition_value, repeat_rule)
  WHERE condition_event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_missions_enabled_sort ON public.missions (enabled, sort_order);

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS missions_set_updated_at ON public.missions;
CREATE TRIGGER missions_set_updated_at
  BEFORE UPDATE ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP POLICY IF EXISTS "missions_admin_all" ON public.missions;
DROP POLICY IF EXISTS "missions_read_all" ON public.missions;

CREATE POLICY "missions_admin_select" ON public.missions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE POLICY "missions_admin_insert" ON public.missions
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE POLICY "missions_admin_update" ON public.missions
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));