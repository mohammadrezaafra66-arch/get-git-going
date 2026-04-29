-- 1. Replace the access_level CHECK constraint to include 'custom'
ALTER TABLE public.dynamic_tables
  DROP CONSTRAINT IF EXISTS dynamic_tables_access_level_check;

ALTER TABLE public.dynamic_tables
  ADD CONSTRAINT dynamic_tables_access_level_check
  CHECK (access_level = ANY (ARRAY[
    'all'::text,
    'manager_only'::text,
    'finance_only'::text,
    'admin_only'::text,
    'sales_only'::text,
    'custom'::text
  ]));

-- 2. Add allowed_roles JSONB column (array of role name strings)
ALTER TABLE public.dynamic_tables
  ADD COLUMN IF NOT EXISTS allowed_roles jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Defensive: ensure it's always a JSON array
ALTER TABLE public.dynamic_tables
  DROP CONSTRAINT IF EXISTS dynamic_tables_allowed_roles_is_array;
ALTER TABLE public.dynamic_tables
  ADD CONSTRAINT dynamic_tables_allowed_roles_is_array
  CHECK (jsonb_typeof(allowed_roles) = 'array');

-- 3. Update visibility helper to support 'custom'
CREATE OR REPLACE FUNCTION public.dyn_table_role_can_view(_user_id uuid, _access_level text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _allowed jsonb;
BEGIN
  -- Admin / manager always see everything
  IF public.has_any_role(_user_id, ARRAY['admin','manager']::app_role[]) THEN
    RETURN true;
  END IF;

  IF _access_level = 'all' THEN RETURN true; END IF;
  IF _access_level = 'manager_only' THEN RETURN false; END IF; -- handled above
  IF _access_level = 'admin_only' THEN RETURN false; END IF;
  IF _access_level = 'finance_only' THEN
    RETURN public.has_role(_user_id, 'accountant'::app_role);
  END IF;
  IF _access_level = 'sales_only' THEN
    RETURN public.has_role(_user_id, 'sales'::app_role);
  END IF;

  -- 'custom' is row-specific so this overload returns false; the row-aware
  -- overload below handles that case via allowed_roles.
  RETURN false;
END;
$$;

-- Row-aware overload (jsonb allowed_roles)
CREATE OR REPLACE FUNCTION public.dyn_table_role_can_view(
  _user_id uuid,
  _access_level text,
  _allowed_roles jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _role_text text;
BEGIN
  IF _access_level <> 'custom' THEN
    RETURN public.dyn_table_role_can_view(_user_id, _access_level);
  END IF;

  -- Custom: admin/manager always pass
  IF public.has_any_role(_user_id, ARRAY['admin','manager']::app_role[]) THEN
    RETURN true;
  END IF;

  IF _allowed_roles IS NULL OR jsonb_typeof(_allowed_roles) <> 'array' THEN
    RETURN false;
  END IF;

  -- Iterate the allowed_roles array; match against app_role enum
  FOR _role_text IN SELECT jsonb_array_elements_text(_allowed_roles) LOOP
    BEGIN
      IF public.has_role(_user_id, _role_text::app_role) THEN
        RETURN true;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      -- ignore unknown role names
      NULL;
    END;
  END LOOP;

  RETURN false;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dyn_table_role_can_view(uuid, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dyn_table_role_can_view(uuid, text, jsonb) TO authenticated;

-- 4. Update the SELECT policy on dynamic_tables to use the row-aware overload
DROP POLICY IF EXISTS dyn_tables_view_by_access_level ON public.dynamic_tables;
CREATE POLICY dyn_tables_view_by_access_level
  ON public.dynamic_tables
  FOR SELECT
  TO authenticated
  USING (
    (
      is_active = true
      AND public.dyn_table_role_can_view(auth.uid(), access_level, allowed_roles)
    )
    OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
  );

-- Update the cells/columns/rows policies similarly (they already join on dynamic_tables)
DROP POLICY IF EXISTS dyn_cells_view_by_access_level ON public.dynamic_table_cells;
CREATE POLICY dyn_cells_view_by_access_level
  ON public.dynamic_table_cells
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dynamic_tables t
      WHERE t.id = dynamic_table_cells.table_id
        AND (
          (t.is_active = true AND public.dyn_table_role_can_view(auth.uid(), t.access_level, t.allowed_roles))
          OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
        )
    )
  );

DROP POLICY IF EXISTS dyn_cols_view_by_access_level ON public.dynamic_table_columns;
CREATE POLICY dyn_cols_view_by_access_level
  ON public.dynamic_table_columns
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dynamic_tables t
      WHERE t.id = dynamic_table_columns.table_id
        AND (
          (t.is_active = true AND public.dyn_table_role_can_view(auth.uid(), t.access_level, t.allowed_roles))
          OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
        )
    )
  );

DROP POLICY IF EXISTS dyn_rows_view_by_access_level ON public.dynamic_table_rows;
CREATE POLICY dyn_rows_view_by_access_level
  ON public.dynamic_table_rows
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dynamic_tables t
      WHERE t.id = dynamic_table_rows.table_id
        AND (
          (t.is_active = true AND public.dyn_table_role_can_view(auth.uid(), t.access_level, t.allowed_roles))
          OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
        )
    )
  );

-- 5. Audit trigger: log access_level / allowed_roles changes
CREATE OR REPLACE FUNCTION public.dyn_tables_log_access_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF (NEW.access_level IS DISTINCT FROM OLD.access_level) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
    VALUES (
      auth.uid(),
      'dynamic_table_access_changed',
      'dynamic_tables',
      NEW.id::text,
      jsonb_build_object(
        'old_access_level', OLD.access_level,
        'new_access_level', NEW.access_level
      )
    );
  END IF;

  IF (NEW.allowed_roles IS DISTINCT FROM OLD.allowed_roles) THEN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
    VALUES (
      auth.uid(),
      'dynamic_table_role_assignment',
      'dynamic_tables',
      NEW.id::text,
      jsonb_build_object(
        'old_allowed_roles', OLD.allowed_roles,
        'new_allowed_roles', NEW.allowed_roles
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dyn_tables_audit_access ON public.dynamic_tables;
CREATE TRIGGER dyn_tables_audit_access
  AFTER UPDATE ON public.dynamic_tables
  FOR EACH ROW
  EXECUTE FUNCTION public.dyn_tables_log_access_changes();