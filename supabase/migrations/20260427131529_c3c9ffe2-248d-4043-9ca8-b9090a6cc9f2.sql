-- 1) Replace audit trigger so it no longer duplicates publish audit logs
CREATE OR REPLACE FUNCTION public.sale_lists_audit_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Publish transitions are audited by the application (manual insert with recipients).
  -- Skip auditing here to prevent duplicates.
  IF (OLD.status IS DISTINCT FROM NEW.status) AND NEW.status = 'published' THEN
    RETURN NEW;
  END IF;

  -- Version bump
  IF (OLD.version_number IS DISTINCT FROM NEW.version_number) THEN
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
  -- Metadata changes
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

-- 2) Recipients view: active users with allowed roles, aggregated
CREATE OR REPLACE VIEW public.publish_recipients_view
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.full_name,
  array_agg(ur.role::text ORDER BY ur.role::text) AS roles
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id
WHERE p.is_active = true
  AND ur.role IN ('admin','manager','accountant','sales')
GROUP BY p.id, p.full_name;

GRANT SELECT ON public.publish_recipients_view TO authenticated;