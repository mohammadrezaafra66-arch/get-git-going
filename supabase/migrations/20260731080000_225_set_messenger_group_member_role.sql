-- Fix: changing messenger group member role failed because there is no UPDATE
-- RLS policy on messenger_group_members. The UI used a direct UPDATE which
-- always returned 0 rows → "شما دسترسی تغییر نقش را ندارید".
--
-- Add a SECURITY DEFINER RPC (same pattern as add_messenger_group_member) so
-- group admins and system admins can set role, including purchaser.

CREATE OR REPLACE FUNCTION public.set_messenger_group_member_role(
  p_group_id uuid,
  p_user_id uuid,
  p_role text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_group_admin boolean;
  v_is_system_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('admin', 'member', 'viewer', 'purchaser') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'نمی‌توانید نقش خودتان را تغییر دهید' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.messenger_group_members
    WHERE group_id = p_group_id
      AND user_id = v_uid
      AND role = 'admin'
  ) INTO v_is_group_admin;

  v_is_system_admin := public.has_role(v_uid, 'admin'::app_role);

  IF NOT (v_is_group_admin OR v_is_system_admin) THEN
    RAISE EXCEPTION 'شما اجازه تغییر نقش اعضای این گروه را ندارید' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.messenger_group_members
    WHERE group_id = p_group_id
      AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'عضو در این گروه یافت نشد' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.messenger_group_members
  SET role = p_role
  WHERE group_id = p_group_id
    AND user_id = p_user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_messenger_group_member_role(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_messenger_group_member_role(uuid, uuid, text) TO authenticated, service_role;

-- Also let system admins add members (previously only group admin role).
CREATE OR REPLACE FUNCTION public.add_messenger_group_member(
  p_group_id uuid,
  p_user_id uuid,
  p_role text DEFAULT 'member'::text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_is_group_admin boolean;
  v_is_system_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('admin', 'member', 'viewer', 'purchaser') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.messenger_group_members
    WHERE group_id = p_group_id
      AND user_id = v_uid
      AND role = 'admin'
  ) INTO v_is_group_admin;

  v_is_system_admin := public.has_role(v_uid, 'admin'::app_role);

  IF NOT (v_is_group_admin OR v_is_system_admin) THEN
    RAISE EXCEPTION 'NOT_GROUP_ADMIN' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.messenger_group_members(group_id, user_id, role)
  VALUES (p_group_id, p_user_id, p_role)
  ON CONFLICT (group_id, user_id) DO UPDATE
    SET role = EXCLUDED.role
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
