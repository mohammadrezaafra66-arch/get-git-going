
-- Slice 11-A: workflow_settings table + RPCs + defaults

CREATE TABLE public.workflow_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_key text NOT NULL UNIQUE,
  process_name_fa text NOT NULL,
  uploader_role text,
  reviewer_role text,
  timer_minutes int NOT NULL DEFAULT 10,
  penalty_enabled boolean NOT NULL DEFAULT true,
  penalty_for text CHECK (penalty_for IN ('uploader','reviewer','both')),
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workflow_settings_process_key_idx ON public.workflow_settings(process_key);

GRANT SELECT, UPDATE ON public.workflow_settings TO authenticated;
GRANT ALL ON public.workflow_settings TO service_role;

ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all authenticated can read settings"
  ON public.workflow_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "only admin and manager can update"
  ON public.workflow_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER set_workflow_settings_updated_at
  BEFORE UPDATE ON public.workflow_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Default rows
INSERT INTO public.workflow_settings
  (process_key, process_name_fa, uploader_role, reviewer_role, timer_minutes, penalty_enabled, penalty_for)
VALUES
  ('inquiry_response',     'پاسخ استعلام قیمت',           NULL,         'manager', 10,  true, 'reviewer'),
  ('bijak_invoice_print',  'بیجک و فاکتور چاپی',          'accountant', 'manager', 10,  true, 'reviewer'),
  ('shipping_receipt',     'بیجک باربری و رسید ارسال',    'manager',    'sales',   360, true, 'uploader'),
  ('delivery_receipt',     'رسید تحویل به مشتری',         'manager',    'sales',   180, true, 'uploader'),
  ('purchase_request',     'درخواست خرید',                NULL,         'manager', 10,  true, 'reviewer');

-- RPC: get all
CREATE OR REPLACE FUNCTION public.get_workflow_settings()
RETURNS SETOF public.workflow_settings
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.workflow_settings ORDER BY process_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_workflow_settings() TO authenticated;

-- RPC: update one (admin/manager only)
CREATE OR REPLACE FUNCTION public.update_workflow_setting(
  p_process_key text,
  p_uploader_role text DEFAULT NULL,
  p_reviewer_role text DEFAULT NULL,
  p_timer_minutes int DEFAULT NULL,
  p_penalty_enabled boolean DEFAULT NULL,
  p_penalty_for text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) THEN
    RAISE EXCEPTION 'فقط مدیر می‌تواند تنظیمات را تغییر دهد';
  END IF;

  UPDATE public.workflow_settings
  SET
    uploader_role   = COALESCE(p_uploader_role,   uploader_role),
    reviewer_role   = COALESCE(p_reviewer_role,   reviewer_role),
    timer_minutes   = COALESCE(p_timer_minutes,   timer_minutes),
    penalty_enabled = COALESCE(p_penalty_enabled, penalty_enabled),
    penalty_for     = COALESCE(p_penalty_for,     penalty_for),
    is_active       = COALESCE(p_is_active,       is_active),
    updated_by      = auth.uid(),
    updated_at      = now()
  WHERE process_key = p_process_key;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'فرایند یافت نشد: %', p_process_key;
  END IF;

  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'workflow_setting', p_process_key, 'updated', auth.uid(),
    jsonb_build_object(
      'timer_minutes',   p_timer_minutes,
      'penalty_enabled', p_penalty_enabled,
      'uploader_role',   p_uploader_role,
      'reviewer_role',   p_reviewer_role,
      'penalty_for',     p_penalty_for,
      'is_active',       p_is_active
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_workflow_setting(text, text, text, int, boolean, text, boolean) TO authenticated;

-- RPC: get one
CREATE OR REPLACE FUNCTION public.get_workflow_setting(p_process_key text)
RETURNS public.workflow_settings
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.workflow_settings WHERE process_key = p_process_key;
$$;

GRANT EXECUTE ON FUNCTION public.get_workflow_setting(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workflow_setting(text) TO service_role;
