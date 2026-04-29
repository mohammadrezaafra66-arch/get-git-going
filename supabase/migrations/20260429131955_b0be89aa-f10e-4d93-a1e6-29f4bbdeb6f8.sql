-- 1) Column with CHECK constraint and default
ALTER TABLE public.dynamic_tables
  ADD COLUMN IF NOT EXISTS access_level text NOT NULL DEFAULT 'all';

ALTER TABLE public.dynamic_tables
  DROP CONSTRAINT IF EXISTS dynamic_tables_access_level_check;

ALTER TABLE public.dynamic_tables
  ADD CONSTRAINT dynamic_tables_access_level_check
  CHECK (access_level IN ('all','manager_only','finance_only','admin_only','sales_only'));

CREATE INDEX IF NOT EXISTS idx_dynamic_tables_access_level
  ON public.dynamic_tables (access_level)
  WHERE is_active = true;

-- 2) Helper function: can current user view this table given its access_level?
CREATE OR REPLACE FUNCTION public.dyn_table_role_can_view(_user_id uuid, _access_level text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_any_role(_user_id, ARRAY['admin','manager']::app_role[])
    OR (
      _access_level = 'all'
    )
    OR (_access_level = 'manager_only'
        AND public.has_any_role(_user_id, ARRAY['admin','manager']::app_role[]))
    OR (_access_level = 'finance_only'
        AND public.has_any_role(_user_id, ARRAY['admin','manager','accountant']::app_role[]))
    OR (_access_level = 'admin_only'
        AND public.has_role(_user_id, 'admin'::app_role))
    OR (_access_level = 'sales_only'
        AND public.has_any_role(_user_id, ARRAY['admin','manager','sales']::app_role[]));
$$;

REVOKE EXECUTE ON FUNCTION public.dyn_table_role_can_view(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dyn_table_role_can_view(uuid, text) TO authenticated;

-- 3) Replace the SELECT policy on dynamic_tables to honor access_level
DROP POLICY IF EXISTS dyn_tables_view_active_all_authed ON public.dynamic_tables;

CREATE POLICY dyn_tables_view_by_access_level
ON public.dynamic_tables FOR SELECT
TO authenticated
USING (
  (is_active = true AND public.dyn_table_role_can_view(auth.uid(), access_level))
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
);

-- 4) Mirror access on columns / rows / cells so blocked users can't read structure or data
DROP POLICY IF EXISTS dyn_cols_view_authed ON public.dynamic_table_columns;
CREATE POLICY dyn_cols_view_by_access_level
ON public.dynamic_table_columns FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.dynamic_tables t
    WHERE t.id = dynamic_table_columns.table_id
      AND ((t.is_active = true AND public.dyn_table_role_can_view(auth.uid(), t.access_level))
           OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
  )
);

DROP POLICY IF EXISTS dyn_rows_view_authed ON public.dynamic_table_rows;
CREATE POLICY dyn_rows_view_by_access_level
ON public.dynamic_table_rows FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.dynamic_tables t
    WHERE t.id = dynamic_table_rows.table_id
      AND ((t.is_active = true AND public.dyn_table_role_can_view(auth.uid(), t.access_level))
           OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
  )
);

DROP POLICY IF EXISTS dyn_cells_view_authed ON public.dynamic_table_cells;
CREATE POLICY dyn_cells_view_by_access_level
ON public.dynamic_table_cells FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.dynamic_tables t
    WHERE t.id = dynamic_table_cells.table_id
      AND ((t.is_active = true AND public.dyn_table_role_can_view(auth.uid(), t.access_level))
           OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
  )
);