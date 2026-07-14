CREATE OR REPLACE FUNCTION public.has_dynamic_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _col text;
  _matched boolean;
  _exists boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Admin shortcut (user_roles.role is TEXT)
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = 'admin'
  ) THEN
    RETURN true;
  END IF;

  _col := CASE _action
    WHEN 'view' THEN 'can_view'
    WHEN 'create' THEN 'can_create'
    WHEN 'update' THEN 'can_update'
    WHEN 'delete' THEN 'can_delete'
    WHEN 'approve' THEN 'can_approve'
    WHEN 'export' THEN 'can_export'
    WHEN 'view_sensitive' THEN 'can_view_sensitive'
    ELSE NULL
  END;

  IF _col IS NULL THEN
    RETURN false;
  END IF;

  EXECUTE format($f$
    SELECT
      EXISTS (
        SELECT 1
        FROM public.role_permissions rp
        JOIN public.user_roles ur
          ON ur.role::text = rp.role_name
        WHERE ur.user_id = $1
          AND rp.module = $2
      ),
      COALESCE(bool_or(rp.%I), false)
    FROM public.role_permissions rp
    JOIN public.user_roles ur
      ON ur.role::text = rp.role_name
    WHERE ur.user_id = $1
      AND rp.module = $2
  $f$, _col)
  INTO _exists, _matched
  USING _user_id, _module;

  IF _exists THEN
    RETURN _matched;
  END IF;

  IF _action IN ('view') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant','sales','viewer']);
  ELSIF _action IN ('create','update') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager']);
  ELSIF _action = 'delete' THEN
    RETURN public.has_role(_user_id, 'admin');
  ELSIF _action IN ('approve','export') THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant']);
  ELSIF _action = 'view_sensitive' THEN
    RETURN public.has_any_role(_user_id, ARRAY['admin','manager','accountant']);
  END IF;

  RETURN false;
END;
$function$;