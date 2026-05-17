-- AFRA-20260517-PERSONS-U01-S04
-- Persons core base table only. Reuses existing patterns:
--   * has_any_role(uuid, app_role[])           — RBAC
--   * set_updated_at()                          — updated_at trigger
--   * audit_logs (action,entity_type,entity_id,actor_id,diff) — audit trail
-- No identifiers, fields, context_links, or person_id columns are added here.
-- Reversible: DROP TRIGGER / DROP FUNCTION / DROP TABLE persons (table is new
-- and starts empty, so dropping is non-destructive for production data).

-- ============================================================
-- 1. Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.persons (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL DEFAULT 'individual',
  display_name     text NOT NULL,
  legal_name       text NULL,
  visibility_scope text NOT NULL DEFAULT 'internal_general',
  is_active        boolean NOT NULL DEFAULT true,
  notes            text NULL,
  created_by       uuid NULL REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT persons_kind_check
    CHECK (kind IN ('individual','organization')),
  CONSTRAINT persons_visibility_scope_check
    CHECK (visibility_scope IN ('internal_general','restricted_finance','restricted_executive')),
  CONSTRAINT persons_display_name_not_blank
    CHECK (length(btrim(display_name)) > 0)
);

COMMENT ON TABLE  public.persons IS 'Unified person identity core (AFRA-Persons S04). Roles & context links live in separate tables.';
COMMENT ON COLUMN public.persons.kind             IS 'individual | organization';
COMMENT ON COLUMN public.persons.visibility_scope IS 'internal_general | restricted_finance | restricted_executive';
COMMENT ON COLUMN public.persons.is_active        IS 'Soft-deactivation flag; DELETE is not exposed via RLS.';

-- ============================================================
-- 2. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_persons_is_active        ON public.persons (is_active);
CREATE INDEX IF NOT EXISTS idx_persons_visibility_scope ON public.persons (visibility_scope);
CREATE INDEX IF NOT EXISTS idx_persons_kind             ON public.persons (kind);

-- ============================================================
-- 3. updated_at trigger (reuses existing public.set_updated_at)
-- ============================================================
DROP TRIGGER IF EXISTS trg_persons_set_updated_at ON public.persons;
CREATE TRIGGER trg_persons_set_updated_at
  BEFORE UPDATE ON public.persons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4. Audit triggers (model: audit_suppliers_insert/update)
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_persons_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    'person.create', 'person', NEW.id::text, auth.uid(),
    jsonb_build_object(
      'kind', NEW.kind,
      'display_name', NEW.display_name,
      'legal_name', NEW.legal_name,
      'visibility_scope', NEW.visibility_scope,
      'is_active', NEW.is_active
    )
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_persons_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_diff jsonb := '{}'::jsonb;
BEGIN
  -- Visibility scope changes get their own dedicated event for sensitivity.
  IF NEW.visibility_scope IS DISTINCT FROM OLD.visibility_scope THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES (
      'person.visibility_change', 'person', NEW.id::text, auth.uid(),
      jsonb_build_object('old', OLD.visibility_scope, 'new', NEW.visibility_scope)
    );
  END IF;

  IF NEW.kind         IS DISTINCT FROM OLD.kind         THEN v_diff := v_diff || jsonb_build_object('kind',         jsonb_build_object('old', OLD.kind,         'new', NEW.kind));         END IF;
  IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN v_diff := v_diff || jsonb_build_object('display_name', jsonb_build_object('old', OLD.display_name, 'new', NEW.display_name)); END IF;
  IF NEW.legal_name   IS DISTINCT FROM OLD.legal_name   THEN v_diff := v_diff || jsonb_build_object('legal_name',   jsonb_build_object('old', OLD.legal_name,   'new', NEW.legal_name));   END IF;
  IF NEW.is_active    IS DISTINCT FROM OLD.is_active    THEN v_diff := v_diff || jsonb_build_object('is_active',    jsonb_build_object('old', OLD.is_active,    'new', NEW.is_active));    END IF;
  IF NEW.notes        IS DISTINCT FROM OLD.notes        THEN v_diff := v_diff || jsonb_build_object('notes',        jsonb_build_object('old', OLD.notes,        'new', NEW.notes));        END IF;

  IF v_diff <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES ('person.update', 'person', NEW.id::text, auth.uid(), v_diff);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_persons_audit_insert ON public.persons;
CREATE TRIGGER trg_persons_audit_insert
  AFTER INSERT ON public.persons
  FOR EACH ROW EXECUTE FUNCTION public.audit_persons_insert();

DROP TRIGGER IF EXISTS trg_persons_audit_update ON public.persons;
CREATE TRIGGER trg_persons_audit_update
  AFTER UPDATE ON public.persons
  FOR EACH ROW EXECUTE FUNCTION public.audit_persons_update();

-- ============================================================
-- 5. RLS
-- ============================================================
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

-- SELECT — visibility-scope aware. Roles known to the app: admin, manager,
-- accountant, sales, viewer. Any other role gets no rows.
DROP POLICY IF EXISTS persons_select_by_visibility_scope ON public.persons;
CREATE POLICY persons_select_by_visibility_scope
  ON public.persons
  FOR SELECT
  TO authenticated
  USING (
    (
      visibility_scope = 'internal_general'
      AND has_any_role(
        auth.uid(),
        ARRAY['admin','manager','accountant','sales','viewer']::app_role[]
      )
    )
    OR (
      visibility_scope = 'restricted_finance'
      AND has_any_role(
        auth.uid(),
        ARRAY['admin','manager','accountant']::app_role[]
      )
    )
    OR (
      visibility_scope = 'restricted_executive'
      AND has_any_role(
        auth.uid(),
        ARRAY['admin','manager']::app_role[]
      )
    )
  );

-- INSERT — admin/manager only.
DROP POLICY IF EXISTS persons_insert_admin_manager ON public.persons;
CREATE POLICY persons_insert_admin_manager
  ON public.persons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
  );

-- UPDATE — admin/manager only.
DROP POLICY IF EXISTS persons_update_admin_manager ON public.persons;
CREATE POLICY persons_update_admin_manager
  ON public.persons
  FOR UPDATE
  TO authenticated
  USING (
    has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
  )
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
  );

-- NOTE: Intentionally no DELETE policy. Soft deactivation via is_active is
-- planned for a future step. Accountant/sales INSERT/UPDATE are not granted
-- here per S04 scope.