CREATE OR REPLACE FUNCTION public.assign_user_role_txt(_target_user uuid, _role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role, assigned_by)
  VALUES (_target_user, _role, auth.uid())
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;