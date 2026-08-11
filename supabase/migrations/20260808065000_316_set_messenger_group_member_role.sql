SET client_encoding='UTF8';

-- Missing RPC for "change messenger group member role".
-- Frontend already calls set_messenger_group_member_role(p_group_id, p_user_id, p_role).
-- Live DB had no such function; messenger_group_members also has no UPDATE RLS policy.
-- Pattern mirrors live add_messenger_group_member: SECURITY DEFINER + group-admin check.
-- (Git migration 225 was never applied on LAN and would also rewrite add_*; do not re-apply it.)

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

  IF NOT EXISTS (
    SELECT 1
    FROM public.messenger_group_members
    WHERE group_id = p_group_id
      AND user_id = v_uid
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'NOT_GROUP_ADMIN' USING ERRCODE = '42501';
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
