CREATE POLICY messenger_members_update_creator
  ON public.messenger_group_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.messenger_groups g
            WHERE g.id = messenger_group_members.group_id
              AND g.created_by = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.messenger_groups g
            WHERE g.id = messenger_group_members.group_id
              AND g.created_by = auth.uid())
  );