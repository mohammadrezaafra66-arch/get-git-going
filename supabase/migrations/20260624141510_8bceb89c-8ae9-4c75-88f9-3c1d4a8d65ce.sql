CREATE OR REPLACE FUNCTION public.add_messenger_group_member(p_group_id uuid, p_user_id uuid, p_role text DEFAULT 'member'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('admin','member','viewer','purchaser') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.messenger_group_members
    WHERE group_id = p_group_id AND user_id = v_uid AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'NOT_GROUP_ADMIN' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.messenger_group_members(group_id, user_id, role)
  VALUES (p_group_id, p_user_id, p_role)
  ON CONFLICT (group_id, user_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'ALREADY_MEMBER' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_id;
END;
$function$;