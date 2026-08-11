-- 300-down.sql — reverse migration 300 (alias write harden + DELETE audit)
-- No BEGIN / COMMIT.

-- Restore 228-era INSERT (sales|accountant allowed) + 239 DELETE (role only).
DROP POLICY IF EXISTS person_aliases_insert_identity_authors ON public.person_aliases;
CREATE POLICY person_aliases_insert_identity_authors
  ON public.person_aliases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales', 'accountant']::text[])
    AND EXISTS (SELECT 1 FROM public.persons p WHERE p.id = person_id)
  );

DROP POLICY IF EXISTS person_aliases_update_admin_manager ON public.person_aliases;
CREATE POLICY person_aliases_update_admin_manager
  ON public.person_aliases
  FOR UPDATE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[]));

DROP POLICY IF EXISTS person_aliases_delete_admin_manager ON public.person_aliases;
CREATE POLICY person_aliases_delete_admin_manager
  ON public.person_aliases
  FOR DELETE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[]));

-- Restore INSERT/UPDATE-only audit (228).
CREATE OR REPLACE FUNCTION public.audit_person_aliases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'person_alias.create' ELSE 'person_alias.update' END,
    'person_alias', NEW.id::text, auth.uid(),
    jsonb_build_object(
      'person_id', NEW.person_id,
      'alias', NEW.alias,
      'alias_normalized', NEW.alias_normalized,
      'alias_kind', NEW.alias_kind
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_person_aliases_audit ON public.person_aliases;
CREATE TRIGGER trg_person_aliases_audit
  AFTER INSERT OR UPDATE ON public.person_aliases
  FOR EACH ROW EXECUTE FUNCTION public.audit_person_aliases();
