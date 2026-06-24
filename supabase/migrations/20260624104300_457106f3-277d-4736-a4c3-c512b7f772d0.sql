
-- 1) messenger_groups
CREATE TABLE IF NOT EXISTS public.messenger_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('private','group','operational')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messenger_groups TO authenticated;
GRANT ALL ON public.messenger_groups TO service_role;
ALTER TABLE public.messenger_groups ENABLE ROW LEVEL SECURITY;

-- 2) messenger_group_members (created BEFORE the helper function references it)
CREATE TABLE IF NOT EXISTS public.messenger_group_members (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  uuid NOT NULL REFERENCES public.messenger_groups(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member','viewer')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_messenger_group_members_user  ON public.messenger_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messenger_group_members_group ON public.messenger_group_members(group_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messenger_group_members TO authenticated;
GRANT ALL ON public.messenger_group_members TO service_role;
ALTER TABLE public.messenger_group_members ENABLE ROW LEVEL SECURITY;

-- Helper: SECURITY DEFINER to avoid RLS recursion on messenger_group_members
CREATE OR REPLACE FUNCTION public.is_messenger_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messenger_group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;

-- Policies: messenger_groups
DROP POLICY IF EXISTS "messenger_groups_select_members" ON public.messenger_groups;
CREATE POLICY "messenger_groups_select_members" ON public.messenger_groups
  FOR SELECT TO authenticated
  USING (public.is_messenger_group_member(id, auth.uid()) OR created_by = auth.uid());

DROP POLICY IF EXISTS "messenger_groups_insert_self" ON public.messenger_groups;
CREATE POLICY "messenger_groups_insert_self" ON public.messenger_groups
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "messenger_groups_update_creator" ON public.messenger_groups;
CREATE POLICY "messenger_groups_update_creator" ON public.messenger_groups
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "messenger_groups_delete_creator" ON public.messenger_groups;
CREATE POLICY "messenger_groups_delete_creator" ON public.messenger_groups
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- Policies: messenger_group_members
DROP POLICY IF EXISTS "messenger_members_select_members" ON public.messenger_group_members;
CREATE POLICY "messenger_members_select_members" ON public.messenger_group_members
  FOR SELECT TO authenticated
  USING (public.is_messenger_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "messenger_members_insert_creator" ON public.messenger_group_members;
CREATE POLICY "messenger_members_insert_creator" ON public.messenger_group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.messenger_groups g WHERE g.id = group_id AND g.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "messenger_members_delete_creator" ON public.messenger_group_members;
CREATE POLICY "messenger_members_delete_creator" ON public.messenger_group_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.messenger_groups g WHERE g.id = group_id AND g.created_by = auth.uid())
    OR user_id = auth.uid()
  );

-- 3) messenger_messages
CREATE TABLE IF NOT EXISTS public.messenger_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.messenger_groups(id) ON DELETE CASCADE,
  sender_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  content    text,
  type       text NOT NULL DEFAULT 'text' CHECK (type IN ('text','image','video','audio','file')),
  reply_to   uuid REFERENCES public.messenger_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at  timestamptz,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_group_created ON public.messenger_messages(group_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_sender ON public.messenger_messages(sender_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messenger_messages TO authenticated;
GRANT ALL ON public.messenger_messages TO service_role;
ALTER TABLE public.messenger_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messenger_messages_select_members" ON public.messenger_messages;
CREATE POLICY "messenger_messages_select_members" ON public.messenger_messages
  FOR SELECT TO authenticated
  USING (public.is_messenger_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "messenger_messages_insert_member" ON public.messenger_messages;
CREATE POLICY "messenger_messages_insert_member" ON public.messenger_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_messenger_group_member(group_id, auth.uid()));

DROP POLICY IF EXISTS "messenger_messages_update_sender" ON public.messenger_messages;
CREATE POLICY "messenger_messages_update_sender" ON public.messenger_messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "messenger_messages_delete_sender" ON public.messenger_messages;
CREATE POLICY "messenger_messages_delete_sender" ON public.messenger_messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());

-- 4) messenger_attachments
CREATE TABLE IF NOT EXISTS public.messenger_attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messenger_messages(id) ON DELETE CASCADE,
  file_path  text NOT NULL,
  file_name  text NOT NULL,
  file_type  text NOT NULL,
  file_size  bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messenger_attachments_message ON public.messenger_attachments(message_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messenger_attachments TO authenticated;
GRANT ALL ON public.messenger_attachments TO service_role;
ALTER TABLE public.messenger_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messenger_attachments_select_members" ON public.messenger_attachments;
CREATE POLICY "messenger_attachments_select_members" ON public.messenger_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messenger_messages m
      WHERE m.id = message_id
        AND public.is_messenger_group_member(m.group_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "messenger_attachments_insert_sender" ON public.messenger_attachments;
CREATE POLICY "messenger_attachments_insert_sender" ON public.messenger_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messenger_messages m
      WHERE m.id = message_id AND m.sender_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "messenger_attachments_delete_sender" ON public.messenger_attachments;
CREATE POLICY "messenger_attachments_delete_sender" ON public.messenger_attachments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messenger_messages m
      WHERE m.id = message_id AND m.sender_id = auth.uid()
    )
  );

-- 5) messenger_read_receipts
CREATE TABLE IF NOT EXISTS public.messenger_read_receipts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messenger_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_messenger_read_receipts_message ON public.messenger_read_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_messenger_read_receipts_user ON public.messenger_read_receipts(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messenger_read_receipts TO authenticated;
GRANT ALL ON public.messenger_read_receipts TO service_role;
ALTER TABLE public.messenger_read_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messenger_receipts_select_members" ON public.messenger_read_receipts;
CREATE POLICY "messenger_receipts_select_members" ON public.messenger_read_receipts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messenger_messages m
      WHERE m.id = message_id
        AND public.is_messenger_group_member(m.group_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "messenger_receipts_insert_self" ON public.messenger_read_receipts;
CREATE POLICY "messenger_receipts_insert_self" ON public.messenger_read_receipts
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messenger_messages m
      WHERE m.id = message_id
        AND public.is_messenger_group_member(m.group_id, auth.uid())
    )
  );
