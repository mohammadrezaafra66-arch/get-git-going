
-- Phase 3 — messenger RPCs + realtime publication

-- 1) create_messenger_group
CREATE OR REPLACE FUNCTION public.create_messenger_group(
  p_name text,
  p_type text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN ('private','group','operational') THEN
    RAISE EXCEPTION 'INVALID_TYPE' USING ERRCODE = '22023';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) < 1 OR length(trim(p_name)) > 120 THEN
    RAISE EXCEPTION 'INVALID_NAME' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.messenger_groups(name, type, created_by)
  VALUES (trim(p_name), p_type, v_uid)
  RETURNING id INTO v_group_id;

  INSERT INTO public.messenger_group_members(group_id, user_id, role)
  VALUES (v_group_id, v_uid, 'admin');

  RETURN v_group_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_messenger_group(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_messenger_group(text, text) TO authenticated, service_role;


-- 2) add_messenger_group_member
CREATE OR REPLACE FUNCTION public.add_messenger_group_member(
  p_group_id uuid,
  p_user_id  uuid,
  p_role     text DEFAULT 'member'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('admin','member','viewer') THEN
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
$$;

REVOKE EXECUTE ON FUNCTION public.add_messenger_group_member(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.add_messenger_group_member(uuid, uuid, text) TO authenticated, service_role;


-- 3) send_messenger_message
CREATE OR REPLACE FUNCTION public.send_messenger_message(
  p_group_id uuid,
  p_content  text,
  p_type     text DEFAULT 'text',
  p_reply_to uuid DEFAULT NULL
) RETURNS public.messenger_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.messenger_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_messenger_group_member(p_group_id, v_uid) THEN
    RAISE EXCEPTION 'NOT_GROUP_MEMBER' USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN ('text','image','video','audio','file') THEN
    RAISE EXCEPTION 'INVALID_TYPE' USING ERRCODE = '22023';
  END IF;

  IF p_content IS NULL OR length(p_content) < 1 OR length(p_content) > 4000 THEN
    RAISE EXCEPTION 'INVALID_CONTENT' USING ERRCODE = '22023';
  END IF;

  IF p_reply_to IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.messenger_messages
      WHERE id = p_reply_to AND group_id = p_group_id
    ) THEN
      RAISE EXCEPTION 'INVALID_REPLY_TARGET' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.messenger_messages(group_id, sender_id, content, type, reply_to)
  VALUES (p_group_id, v_uid, p_content, p_type, p_reply_to)
  RETURNING * INTO v_row;

  INSERT INTO public.messenger_read_receipts(message_id, user_id)
  VALUES (v_row.id, v_uid)
  ON CONFLICT (message_id, user_id) DO NOTHING;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_messenger_message(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.send_messenger_message(uuid, text, text, uuid) TO authenticated, service_role;


-- 4) send_messenger_message_with_attachment
CREATE OR REPLACE FUNCTION public.send_messenger_message_with_attachment(
  p_group_id  uuid,
  p_content   text,
  p_type      text,
  p_reply_to  uuid,
  p_file_path text,
  p_file_name text,
  p_file_type text,
  p_file_size bigint
) RETURNS public.messenger_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.messenger_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_messenger_group_member(p_group_id, v_uid) THEN
    RAISE EXCEPTION 'NOT_GROUP_MEMBER' USING ERRCODE = '42501';
  END IF;

  IF p_type NOT IN ('text','image','video','audio','file') THEN
    RAISE EXCEPTION 'INVALID_TYPE' USING ERRCODE = '22023';
  END IF;

  IF p_content IS NULL OR length(p_content) < 1 OR length(p_content) > 4000 THEN
    RAISE EXCEPTION 'INVALID_CONTENT' USING ERRCODE = '22023';
  END IF;

  IF p_file_size IS NULL OR p_file_size < 1 OR p_file_size > 52428800 THEN
    RAISE EXCEPTION 'INVALID_FILE_SIZE' USING ERRCODE = '22023';
  END IF;

  IF NOT public.messenger_attachment_size_ok(p_file_path, p_file_size) THEN
    RAISE EXCEPTION 'FILE_SIZE_TYPE_LIMIT' USING ERRCODE = '22023';
  END IF;

  IF split_part(p_file_path, '/', 1) <> v_uid::text THEN
    RAISE EXCEPTION 'INVALID_FILE_PATH_OWNER' USING ERRCODE = '42501';
  END IF;

  IF p_reply_to IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.messenger_messages
      WHERE id = p_reply_to AND group_id = p_group_id
    ) THEN
      RAISE EXCEPTION 'INVALID_REPLY_TARGET' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.messenger_messages(group_id, sender_id, content, type, reply_to)
  VALUES (p_group_id, v_uid, p_content, p_type, p_reply_to)
  RETURNING * INTO v_row;

  INSERT INTO public.messenger_attachments(message_id, file_path, file_name, file_type, file_size)
  VALUES (v_row.id, p_file_path, p_file_name, p_file_type, p_file_size);

  INSERT INTO public.messenger_read_receipts(message_id, user_id)
  VALUES (v_row.id, v_uid)
  ON CONFLICT (message_id, user_id) DO NOTHING;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_messenger_message_with_attachment(uuid, text, text, uuid, text, text, text, bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.send_messenger_message_with_attachment(uuid, text, text, uuid, text, text, text, bigint) TO authenticated, service_role;


-- 5) Realtime publication for messenger_messages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messenger_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messenger_messages';
  END IF;
END $$;
