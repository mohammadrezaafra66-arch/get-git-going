-- AFRA-20260517-PERSONS-U01-S06
-- Create person_identifiers table with RLS, partial unique index, audit triggers.
-- Reversible notes (DOWN):
--   DROP TRIGGER IF EXISTS trg_person_identifiers_validate ON public.person_identifiers;
--   DROP TRIGGER IF EXISTS trg_person_identifiers_audit_insert ON public.person_identifiers;
--   DROP TRIGGER IF EXISTS trg_person_identifiers_audit_update ON public.person_identifiers;
--   DROP TRIGGER IF EXISTS trg_person_identifiers_set_updated_at ON public.person_identifiers;
--   DROP FUNCTION IF EXISTS public.validate_person_identifier();
--   DROP FUNCTION IF EXISTS public.audit_person_identifiers_insert();
--   DROP FUNCTION IF EXISTS public.audit_person_identifiers_update();
--   DROP TABLE IF EXISTS public.person_identifiers;

CREATE TABLE IF NOT EXISTS public.person_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  kind text NOT NULL,
  value_raw text NOT NULL,
  value_normalized text NOT NULL,
  status text NOT NULL DEFAULT 'provisional',
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz NULL,
  verified_by uuid NULL REFERENCES auth.users(id),
  created_by uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_identifiers_kind_check CHECK (kind IN (
    'mobile_e164','landline','national_id_ir','tax_id_ir',
    'company_reg_id_ir','email','iban','custom'
  )),
  CONSTRAINT person_identifiers_status_check CHECK (status IN (
    'provisional','confirmed','revoked'
  )),
  CONSTRAINT person_identifiers_value_raw_not_blank
    CHECK (length(btrim(value_raw)) > 0),
  CONSTRAINT person_identifiers_value_normalized_not_blank
    CHECK (length(btrim(value_normalized)) > 0)
);

COMMENT ON TABLE public.person_identifiers IS
  'Person identifiers (phone, national id, email, iban, ...). Confirmed values are deduped via partial unique index. Created in S06.';
COMMENT ON COLUMN public.person_identifiers.value_raw IS
  'Raw value as entered. Normalization to value_normalized is performed by server logic in S07.';
COMMENT ON COLUMN public.person_identifiers.value_normalized IS
  'Normalized value used for duplicate detection. In S06 may equal value_raw; full normalization deferred to S07.';
COMMENT ON COLUMN public.person_identifiers.status IS
  'provisional=unverified, confirmed=verified & unique, revoked=invalidated (excluded from uniqueness).';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_person_identifiers_person_id
  ON public.person_identifiers(person_id);
CREATE INDEX IF NOT EXISTS idx_person_identifiers_kind
  ON public.person_identifiers(kind);
CREATE INDEX IF NOT EXISTS idx_person_identifiers_kind_value
  ON public.person_identifiers(kind, value_normalized);

-- Partial unique index: only one confirmed identifier per (kind, value_normalized)
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_confirmed_kind_value
  ON public.person_identifiers(kind, value_normalized)
  WHERE status = 'confirmed';

-- Partial unique index: at most one active primary identifier per (person, kind)
-- (active = not revoked). Safe enforcement at DB level.
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_primary_active
  ON public.person_identifiers(person_id, kind)
  WHERE is_primary = true AND status <> 'revoked';

-- updated_at trigger (reuse existing helper)
CREATE TRIGGER trg_person_identifiers_set_updated_at
  BEFORE UPDATE ON public.person_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Light validation trigger: revoked identifiers cannot be marked primary.
CREATE OR REPLACE FUNCTION public.validate_person_identifier()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_primary = true AND NEW.status = 'revoked' THEN
    RAISE EXCEPTION 'A revoked identifier cannot be primary';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_person_identifiers_validate
  BEFORE INSERT OR UPDATE ON public.person_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.validate_person_identifier();

-- Enable RLS
ALTER TABLE public.person_identifiers ENABLE ROW LEVEL SECURITY;

-- SELECT: inherits visibility from parent person via persons RLS.
CREATE POLICY "person_identifiers_select_via_person"
  ON public.person_identifiers
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.persons p
    WHERE p.id = person_identifiers.person_id
  ));

-- INSERT: admin/manager only.
CREATE POLICY "person_identifiers_insert_admin_manager"
  ON public.person_identifiers
  FOR INSERT
  TO authenticated
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

-- UPDATE: admin/manager only.
CREATE POLICY "person_identifiers_update_admin_manager"
  ON public.person_identifiers
  FOR UPDATE
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

-- No DELETE policy: revocation is via status='revoked'.

-- Audit triggers — mirror existing pattern (SECURITY DEFINER, public.audit_logs).
CREATE OR REPLACE FUNCTION public.audit_person_identifiers_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'person_identifier', NEW.id::text, 'person.identifier.add',
    jsonb_build_object(
      'person_id', NEW.person_id,
      'kind', NEW.kind,
      'value_normalized', NEW.value_normalized,
      'status', NEW.status,
      'is_primary', NEW.is_primary
    ));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_person_identifiers_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  action_name text := 'person.identifier.update';
  diff_obj jsonb := '{}'::jsonb;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'revoked' THEN
    action_name := 'person.identifier.revoke';
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    diff_obj := diff_obj || jsonb_build_object('status',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF OLD.value_normalized IS DISTINCT FROM NEW.value_normalized THEN
    diff_obj := diff_obj || jsonb_build_object('value_normalized',
      jsonb_build_object('from', OLD.value_normalized, 'to', NEW.value_normalized));
  END IF;
  IF OLD.kind IS DISTINCT FROM NEW.kind THEN
    diff_obj := diff_obj || jsonb_build_object('kind',
      jsonb_build_object('from', OLD.kind, 'to', NEW.kind));
  END IF;
  IF OLD.is_primary IS DISTINCT FROM NEW.is_primary THEN
    diff_obj := diff_obj || jsonb_build_object('is_primary',
      jsonb_build_object('from', OLD.is_primary, 'to', NEW.is_primary));
  END IF;

  IF diff_obj <> '{}'::jsonb THEN
    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (auth.uid(), 'person_identifier', NEW.id::text, action_name,
      diff_obj || jsonb_build_object('person_id', NEW.person_id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_person_identifiers_audit_insert
  AFTER INSERT ON public.person_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.audit_person_identifiers_insert();

CREATE TRIGGER trg_person_identifiers_audit_update
  AFTER UPDATE ON public.person_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.audit_person_identifiers_update();