SET client_encoding='UTF8';

-- =====================================================================
-- 300 — person_aliases: tighten write RLS + audit DELETE
--
-- Audit: docs/verification/person-aliases-phase4-audit.md
-- Down:   docs/verification/300-down.sql
--
-- Strengthen only:
--   * INSERT was admin|manager|sales|accountant → admin|manager + can_read_person
--   * UPDATE/DELETE gain can_read_person(person_id)
--   * audit_person_aliases covers DELETE (person_alias.delete)
-- No schema/column changes. Search RPC unchanged (hard DELETE already correct).
-- =====================================================================

-- ----- RLS -----
DROP POLICY IF EXISTS person_aliases_insert_identity_authors ON public.person_aliases;
CREATE POLICY person_aliases_insert_identity_authors
  ON public.person_aliases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    AND public.can_read_person(person_id)
  );

DROP POLICY IF EXISTS person_aliases_update_admin_manager ON public.person_aliases;
CREATE POLICY person_aliases_update_admin_manager
  ON public.person_aliases
  FOR UPDATE
  TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    AND public.can_read_person(person_id)
  )
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    AND public.can_read_person(person_id)
  );

DROP POLICY IF EXISTS person_aliases_delete_admin_manager ON public.person_aliases;
CREATE POLICY person_aliases_delete_admin_manager
  ON public.person_aliases
  FOR DELETE
  TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[])
    AND public.can_read_person(person_id)
  );

-- ----- Audit: include DELETE -----
CREATE OR REPLACE FUNCTION public.audit_person_aliases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES (
      'person_alias.delete',
      'person_alias',
      OLD.id::text,
      auth.uid(),
      jsonb_build_object(
        'person_id', OLD.person_id,
        'alias', OLD.alias,
        'alias_normalized', OLD.alias_normalized,
        'alias_kind', OLD.alias_kind
      )
    );
    RETURN OLD;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'person_alias.create' ELSE 'person_alias.update' END,
    'person_alias',
    NEW.id::text,
    auth.uid(),
    jsonb_build_object(
      'person_id', NEW.person_id,
      'alias', NEW.alias,
      'alias_normalized', NEW.alias_normalized,
      'alias_kind', NEW.alias_kind,
      'before', CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object(
        'alias', OLD.alias,
        'alias_kind', OLD.alias_kind
      ) ELSE NULL END
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_person_aliases_audit ON public.person_aliases;
CREATE TRIGGER trg_person_aliases_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.person_aliases
  FOR EACH ROW EXECUTE FUNCTION public.audit_person_aliases();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_aliases TO authenticated;
