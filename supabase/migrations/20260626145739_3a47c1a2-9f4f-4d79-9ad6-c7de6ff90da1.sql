ALTER TABLE public.bot_api_keys
  ADD COLUMN IF NOT EXISTS managed_by_role TEXT DEFAULT 'admin';

CREATE TABLE IF NOT EXISTS public.bot_api_key_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id        UUID,
  key_name      TEXT,
  action        TEXT NOT NULL CHECK (action IN ('create','delete','view_key','rotate','deactivate')),
  performed_by  UUID NOT NULL REFERENCES public.profiles(id),
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason        TEXT,
  metadata      JSONB DEFAULT '{}'
);
GRANT SELECT ON public.bot_api_key_audit_log TO authenticated;
GRANT INSERT ON public.bot_api_key_audit_log TO authenticated;
GRANT ALL ON public.bot_api_key_audit_log TO service_role;
ALTER TABLE public.bot_api_key_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select" ON public.bot_api_key_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "audit_log_insert" ON public.bot_api_key_audit_log
  FOR INSERT TO authenticated WITH CHECK (performed_by = auth.uid());

CREATE OR REPLACE FUNCTION public.delete_bot_api_key_secure(
  _key_id UUID,
  _reason TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_role    TEXT;
  v_managed_role TEXT;
  v_key_name     TEXT;
  v_user_id      UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT role::text INTO v_user_role
  FROM public.user_roles
  WHERE user_id = v_user_id
  LIMIT 1;

  SELECT managed_by_role, name INTO v_managed_role, v_key_name
  FROM public.bot_api_keys
  WHERE id = _key_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'KEY_NOT_FOUND: کلید یافت نشد';
  END IF;

  IF v_user_role IS DISTINCT FROM 'admin' AND v_user_role IS DISTINCT FROM v_managed_role THEN
    RAISE EXCEPTION 'UNAUTHORIZED: شما مجاز به حذف این کلید نیستید'
      USING ERRCODE = 'P0001';
  END IF;

  IF _reason IS NULL OR trim(_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: دلیل حذف الزامی است'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.bot_api_key_audit_log (key_id, key_name, action, performed_by, reason)
  VALUES (_key_id, v_key_name, 'delete', v_user_id, _reason);

  UPDATE public.bot_api_keys
  SET is_active = false
  WHERE id = _key_id;

  RETURN true;
END; $$;