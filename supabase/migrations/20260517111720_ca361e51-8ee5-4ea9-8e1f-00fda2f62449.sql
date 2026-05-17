
-- =========================================================
-- S05: Configurable Person Fields
-- Task: AFRA-20260517-PERSONS-U01-S05
-- Creates: person_field_definitions, person_field_values
-- No changes to existing tables. No person_identifiers / context_links.
-- Reversible: DROP TABLE IF EXISTS public.person_field_values, public.person_field_definitions CASCADE;
-- =========================================================

-- ---------- person_field_definitions ----------
CREATE TABLE IF NOT EXISTS public.person_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  field_type text NOT NULL,
  options jsonb NULL,
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  help_text text NULL,
  validation_regex text NULL,
  applies_to_kind text NOT NULL DEFAULT 'both',
  created_by uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_field_definitions_field_type_chk
    CHECK (field_type IN ('text','number','date','bool','select','multiselect','jsonb')),
  CONSTRAINT person_field_definitions_applies_to_kind_chk
    CHECK (applies_to_kind IN ('individual','organization','both')),
  CONSTRAINT person_field_definitions_name_not_blank
    CHECK (length(btrim(name)) > 0),
  CONSTRAINT person_field_definitions_label_not_blank
    CHECK (length(btrim(label)) > 0)
);

COMMENT ON TABLE public.person_field_definitions IS
  'S05: Admin-configurable field definitions for persons. Full required-field enforcement on person create/update is deferred to S07 (RPC/serverFn).';

CREATE INDEX IF NOT EXISTS idx_pfd_is_active ON public.person_field_definitions (is_active);
CREATE INDEX IF NOT EXISTS idx_pfd_sort_order ON public.person_field_definitions (sort_order);
CREATE INDEX IF NOT EXISTS idx_pfd_applies_to_kind ON public.person_field_definitions (applies_to_kind);

-- updated_at trigger (reuse existing helper)
DROP TRIGGER IF EXISTS trg_pfd_updated_at ON public.person_field_definitions;
CREATE TRIGGER trg_pfd_updated_at
  BEFORE UPDATE ON public.person_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- person_field_values ----------
CREATE TABLE IF NOT EXISTS public.person_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  field_definition_id uuid NOT NULL REFERENCES public.person_field_definitions(id) ON DELETE RESTRICT,
  value jsonb NOT NULL,
  updated_by uuid NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, field_definition_id)
);

COMMENT ON TABLE public.person_field_values IS
  'S05: Per-person values for configurable fields. SELECT visibility inherits from public.persons RLS via EXISTS subquery.';

CREATE INDEX IF NOT EXISTS idx_pfv_person_id ON public.person_field_values (person_id);
CREATE INDEX IF NOT EXISTS idx_pfv_field_definition_id ON public.person_field_values (field_definition_id);

DROP TRIGGER IF EXISTS trg_pfv_updated_at ON public.person_field_values;
CREATE TRIGGER trg_pfv_updated_at
  BEFORE UPDATE ON public.person_field_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Validation trigger for person_field_values
-- Enforces:
--   * field definition is active
--   * applies_to_kind matches parent person.kind or is 'both'
-- =========================================================
CREATE OR REPLACE FUNCTION public.validate_person_field_value()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_def_active boolean;
  v_def_kind text;
  v_person_kind text;
BEGIN
  SELECT is_active, applies_to_kind
    INTO v_def_active, v_def_kind
    FROM public.person_field_definitions
   WHERE id = NEW.field_definition_id;

  IF v_def_active IS NULL THEN
    RAISE EXCEPTION 'person_field_values: unknown field_definition_id %', NEW.field_definition_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_def_active = false THEN
    RAISE EXCEPTION 'person_field_values: field definition % is inactive', NEW.field_definition_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT kind INTO v_person_kind FROM public.persons WHERE id = NEW.person_id;
  IF v_person_kind IS NULL THEN
    RAISE EXCEPTION 'person_field_values: unknown person_id %', NEW.person_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_def_kind <> 'both' AND v_def_kind <> v_person_kind THEN
    RAISE EXCEPTION 'person_field_values: applies_to_kind (%) does not match person.kind (%)',
      v_def_kind, v_person_kind
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pfv_validate ON public.person_field_values;
CREATE TRIGGER trg_pfv_validate
  BEFORE INSERT OR UPDATE ON public.person_field_values
  FOR EACH ROW EXECUTE FUNCTION public.validate_person_field_value();

-- =========================================================
-- Audit triggers (mirror the S04 audit_persons_* pattern)
-- =========================================================
CREATE OR REPLACE FUNCTION public.audit_person_field_definitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'person_field_definition', NEW.id::text, 'create',
      jsonb_build_object(
        'name', NEW.name, 'label', NEW.label, 'field_type', NEW.field_type,
        'is_required', NEW.is_required, 'is_active', NEW.is_active,
        'applies_to_kind', NEW.applies_to_kind));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'person_field_definition', NEW.id::text, 'update',
      jsonb_strip_nulls(jsonb_build_object(
        'label',  CASE WHEN OLD.label IS DISTINCT FROM NEW.label THEN jsonb_build_object('from', OLD.label, 'to', NEW.label) END,
        'field_type', CASE WHEN OLD.field_type IS DISTINCT FROM NEW.field_type THEN jsonb_build_object('from', OLD.field_type, 'to', NEW.field_type) END,
        'is_required', CASE WHEN OLD.is_required IS DISTINCT FROM NEW.is_required THEN jsonb_build_object('from', OLD.is_required, 'to', NEW.is_required) END,
        'is_active', CASE WHEN OLD.is_active IS DISTINCT FROM NEW.is_active THEN jsonb_build_object('from', OLD.is_active, 'to', NEW.is_active) END,
        'applies_to_kind', CASE WHEN OLD.applies_to_kind IS DISTINCT FROM NEW.applies_to_kind THEN jsonb_build_object('from', OLD.applies_to_kind, 'to', NEW.applies_to_kind) END,
        'sort_order', CASE WHEN OLD.sort_order IS DISTINCT FROM NEW.sort_order THEN jsonb_build_object('from', OLD.sort_order, 'to', NEW.sort_order) END
      )));
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pfd_audit ON public.person_field_definitions;
CREATE TRIGGER trg_pfd_audit
  AFTER INSERT OR UPDATE ON public.person_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.audit_person_field_definitions();

CREATE OR REPLACE FUNCTION public.audit_person_field_values()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'person_field_value', NEW.id::text, 'create',
      jsonb_build_object('person_id', NEW.person_id, 'field_definition_id', NEW.field_definition_id, 'value', NEW.value));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.value IS DISTINCT FROM NEW.value THEN
      INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
      VALUES (auth.uid(), 'person_field_value', NEW.id::text, 'update',
        jsonb_build_object('person_id', NEW.person_id, 'field_definition_id', NEW.field_definition_id,
          'value', jsonb_build_object('from', OLD.value, 'to', NEW.value)));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pfv_audit ON public.person_field_values;
CREATE TRIGGER trg_pfv_audit
  AFTER INSERT OR UPDATE ON public.person_field_values
  FOR EACH ROW EXECUTE FUNCTION public.audit_person_field_values();

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.person_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_field_values ENABLE ROW LEVEL SECURITY;

-- person_field_definitions
DROP POLICY IF EXISTS pfd_select_active_all_authed ON public.person_field_definitions;
CREATE POLICY pfd_select_active_all_authed
ON public.person_field_definitions
FOR SELECT
TO authenticated
USING (
  is_active = true
  OR public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
);

DROP POLICY IF EXISTS pfd_insert_admin_manager ON public.person_field_definitions;
CREATE POLICY pfd_insert_admin_manager
ON public.person_field_definitions
FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

DROP POLICY IF EXISTS pfd_update_admin_manager ON public.person_field_definitions;
CREATE POLICY pfd_update_admin_manager
ON public.person_field_definitions
FOR UPDATE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- No DELETE policy (use is_active=false).

-- person_field_values: visibility inherits from parent persons RLS
DROP POLICY IF EXISTS pfv_select_via_person ON public.person_field_values;
CREATE POLICY pfv_select_via_person
ON public.person_field_values
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.persons p WHERE p.id = person_field_values.person_id)
);
-- The EXISTS works because RLS on persons restricts which rows the user can see;
-- if persons row is not visible, the subquery returns no row => denied.

DROP POLICY IF EXISTS pfv_insert_admin_manager ON public.person_field_values;
CREATE POLICY pfv_insert_admin_manager
ON public.person_field_values
FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

DROP POLICY IF EXISTS pfv_update_admin_manager ON public.person_field_values;
CREATE POLICY pfv_update_admin_manager
ON public.person_field_values
FOR UPDATE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[]));

-- No DELETE policy.
