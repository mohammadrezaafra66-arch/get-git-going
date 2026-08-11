
-- 1) unique index for fast file_path lookup
CREATE UNIQUE INDEX IF NOT EXISTS ux_messenger_attachments_file_path
  ON public.messenger_attachments(file_path);

-- 2) helper functions in public
CREATE OR REPLACE FUNCTION public.messenger_attachment_path_owner(_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT split_part(_name, '/', 1) = auth.uid()::text
$$;

CREATE OR REPLACE FUNCTION public.messenger_attachment_size_ok(_name text, _size bigint)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(regexp_replace(_name, '^.*\.', ''))
    WHEN 'jpg'  THEN _size <= 5242880
    WHEN 'jpeg' THEN _size <= 5242880
    WHEN 'png'  THEN _size <= 5242880
    WHEN 'webp' THEN _size <= 5242880
    WHEN 'mp4'  THEN _size <= 52428800
    WHEN 'webm' THEN _size <= 52428800
    WHEN 'pdf'  THEN _size <= 20971520
    WHEN 'doc'  THEN _size <= 10485760
    WHEN 'docx' THEN _size <= 10485760
    WHEN 'zip'  THEN _size <= 5242880
    WHEN 'xlsx' THEN _size <= 5242880
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.messenger_attachment_visible(_name text, _uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messenger_attachments a
    JOIN public.messenger_messages m ON m.id = a.message_id
    WHERE a.file_path = _name
      AND public.is_messenger_group_member(m.group_id, _uid)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.messenger_attachment_visible(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.messenger_attachment_visible(text, uuid) TO authenticated, service_role;

-- 3) storage.objects policies scoped to bucket
DROP POLICY IF EXISTS "msg_att_insert" ON storage.objects;
DROP POLICY IF EXISTS "msg_att_select" ON storage.objects;
DROP POLICY IF EXISTS "msg_att_delete" ON storage.objects;

CREATE POLICY "msg_att_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'messenger-attachments'
    AND public.messenger_attachment_path_owner(name)
    AND public.messenger_attachment_size_ok(name, COALESCE((metadata->>'size')::bigint, 0))
  );

CREATE POLICY "msg_att_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'messenger-attachments'
    AND (
      owner = auth.uid()
      OR public.messenger_attachment_visible(name, auth.uid())
    )
  );

CREATE POLICY "msg_att_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'messenger-attachments'
    AND owner = auth.uid()
    AND public.messenger_attachment_path_owner(name)
  );
-- no UPDATE policy → updates denied by default
