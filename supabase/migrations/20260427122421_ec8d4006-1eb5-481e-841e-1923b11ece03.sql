-- Add published_at to sale_lists
ALTER TABLE public.sale_lists
ADD COLUMN IF NOT EXISTS published_at timestamptz DEFAULT NULL;

-- Audit trigger function for sale_lists status transitions and updates
CREATE OR REPLACE FUNCTION public.sale_lists_audit_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Detect publish transition
  IF (OLD.status IS DISTINCT FROM NEW.status) AND NEW.status = 'published' THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES (
      'sale_list_published',
      'sale_list',
      NEW.id::text,
      auth.uid(),
      jsonb_build_object(
        'version_number', NEW.version_number,
        'published_at', NEW.published_at,
        'name', NEW.name
      )
    );
  -- Detect version bump (sale_list_versioned)
  ELSIF (OLD.version_number IS DISTINCT FROM NEW.version_number) THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES (
      'sale_list_versioned',
      'sale_list',
      NEW.id::text,
      auth.uid(),
      jsonb_build_object(
        'old_version', OLD.version_number,
        'new_version', NEW.version_number,
        'name', NEW.name
      )
    );
  -- Generic update (metadata changes)
  ELSIF (OLD.name IS DISTINCT FROM NEW.name)
     OR (OLD.description IS DISTINCT FROM NEW.description)
     OR (OLD.terms_text IS DISTINCT FROM NEW.terms_text)
     OR (OLD.selected_columns IS DISTINCT FROM NEW.selected_columns) THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
    VALUES (
      'sale_list_updated',
      'sale_list',
      NEW.id::text,
      auth.uid(),
      jsonb_build_object('name', NEW.name)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sale_lists_audit_update_trg ON public.sale_lists;
CREATE TRIGGER sale_lists_audit_update_trg
AFTER UPDATE ON public.sale_lists
FOR EACH ROW
EXECUTE FUNCTION public.sale_lists_audit_update();