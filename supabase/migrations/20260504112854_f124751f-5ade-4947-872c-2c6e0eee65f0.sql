DO $$ BEGIN
  CREATE TYPE public.profile_field_type AS ENUM ('text', 'number', 'select', 'multiselect', 'time', 'days', 'textarea', 'date');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.profile_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  field_type public.profile_field_type NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  show_on_register boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  help_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_field_name_format CHECK (name ~ '^[a-z_][a-z0-9_]*$' AND length(name) BETWEEN 2 AND 50)
);

CREATE INDEX IF NOT EXISTS idx_profile_field_defs_active ON public.profile_field_definitions(is_active, sort_order);

ALTER TABLE public.profile_field_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active fields for register" ON public.profile_field_definitions;
CREATE POLICY "Anyone can read active fields for register"
  ON public.profile_field_definitions FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage profile fields" ON public.profile_field_definitions;
CREATE POLICY "Admins can manage profile fields"
  ON public.profile_field_definitions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_pfd_updated_at ON public.profile_field_definitions;
CREATE TRIGGER trg_pfd_updated_at BEFORE UPDATE ON public.profile_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.profile_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  field_name text NOT NULL REFERENCES public.profile_field_definitions(name) ON UPDATE CASCADE ON DELETE CASCADE,
  value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_pfv_user ON public.profile_field_values(user_id);

ALTER TABLE public.profile_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own field values" ON public.profile_field_values;
CREATE POLICY "Users see own field values"
  ON public.profile_field_values FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Users insert own field values" ON public.profile_field_values;
CREATE POLICY "Users insert own field values"
  ON public.profile_field_values FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users update own field values" ON public.profile_field_values;
CREATE POLICY "Users update own field values"
  ON public.profile_field_values FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete field values" ON public.profile_field_values;
CREATE POLICY "Admins delete field values"
  ON public.profile_field_values FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_pfv_updated_at ON public.profile_field_values;
CREATE TRIGGER trg_pfv_updated_at BEFORE UPDATE ON public.profile_field_values
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.profile_field_definitions (name, label, field_type, options, is_required, sort_order, show_on_register)
VALUES
  ('employment_type', 'نوع همکاری', 'select',
    '[{"value":"full_time","label":"تمام وقت"},{"value":"part_time","label":"پاره‌وقت"},{"value":"contractor","label":"پیمانکار"},{"value":"intern","label":"کارآموز"}]'::jsonb,
    false, 10, true),
  ('work_days', 'روزهای کاری', 'days', '[]'::jsonb, false, 20, true),
  ('work_start_time', 'ساعت شروع کار', 'time', '[]'::jsonb, false, 30, true),
  ('work_end_time', 'ساعت پایان کار', 'time', '[]'::jsonb, false, 40, true),
  ('address', 'آدرس', 'textarea', '[]'::jsonb, false, 50, false)
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.quick_approve_user(_user_id uuid, _role text DEFAULT 'sales')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role_enum app_role;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can approve users';
  END IF;

  BEGIN
    _role_enum := _role::app_role;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Invalid role: %', _role;
  END;

  UPDATE public.profiles
  SET status = 'active', is_active = true, updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role_enum)
  ON CONFLICT (user_id, role) DO NOTHING;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'user_quick_approved', 'profile', _user_id, jsonb_build_object('role', _role));
  EXCEPTION WHEN undefined_table THEN NULL;
        WHEN undefined_column THEN NULL; END;
END;
$$;

REVOKE ALL ON FUNCTION public.quick_approve_user(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quick_approve_user(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reactivate_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admin can reactivate users';
  END IF;

  UPDATE public.profiles
  SET status = 'active', is_active = true, updated_at = now()
  WHERE id = _user_id;

  BEGIN
    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
    VALUES (auth.uid(), 'user_reactivated', 'profile', _user_id, '{}'::jsonb);
  EXCEPTION WHEN undefined_table THEN NULL;
        WHEN undefined_column THEN NULL; END;
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_profile_field_value(_user_id uuid, _field_name text, _value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Auth required';
  END IF;
  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  INSERT INTO public.profile_field_values (user_id, field_name, value)
  VALUES (_user_id, _field_name, _value)
  ON CONFLICT (user_id, field_name)
  DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.set_profile_field_value(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_profile_field_value(uuid, text, jsonb) TO authenticated;