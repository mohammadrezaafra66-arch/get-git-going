ALTER TABLE public.messenger_groups
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_messenger_groups_is_active
  ON public.messenger_groups(is_active);

CREATE OR REPLACE FUNCTION public.deactivate_messenger_group(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'فقط مدیر سیستم می‌تواند گروه را حذف کند';
  END IF;

  UPDATE public.messenger_groups
     SET is_active = false
   WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'گروه یافت نشد';
  END IF;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'messenger_group',
    p_group_id::text,
    'deactivated',
    auth.uid(),
    jsonb_build_object('is_active', false)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deactivate_messenger_group(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_messenger_group(uuid) TO authenticated;