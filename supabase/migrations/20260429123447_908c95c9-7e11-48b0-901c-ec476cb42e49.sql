-- E-8.1: Pending user approval flow

-- 1) Add status/position/registered_at to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS registered_at timestamptz NOT NULL DEFAULT now();

-- Validation trigger (avoid CHECK on text since trigger style is project standard)
CREATE OR REPLACE FUNCTION public.validate_profile_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','active','inactive','rejected') THEN
    RAISE EXCEPTION 'invalid profile status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_validate_status ON public.profiles;
CREATE TRIGGER profiles_validate_status
  BEFORE INSERT OR UPDATE OF status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_profile_status();

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- 2) Trigger to auto-create profile when a new auth user signs up (status=pending)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_first boolean;
  v_full_name text;
  v_phone text;
  v_position text;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_phone := NEW.raw_user_meta_data->>'phone';
  v_position := NEW.raw_user_meta_data->>'position_proposed';

  SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first;

  INSERT INTO public.profiles (id, full_name, phone, position, status, is_active, registered_at)
  VALUES (
    NEW.id,
    v_full_name,
    v_phone,
    v_position,
    CASE WHEN is_first THEN 'active' ELSE 'pending' END,
    true,
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- First user becomes admin
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Audit log (actor = the new user)
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (NEW.id, 'user', NEW.id::text, 'user_registered',
          jsonb_build_object('email', NEW.email, 'full_name', v_full_name, 'phone', v_phone));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 3) RPC: approve user (admin only)
CREATE OR REPLACE FUNCTION public.approve_pending_user(
  _user_id uuid,
  _role app_role,
  _position text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.profiles
  SET status = 'active',
      is_active = true,
      position = COALESCE(_position, position),
      updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'user', _user_id::text, 'user_approved',
          jsonb_build_object('role', _role, 'position', _position));
END;
$$;

-- 4) RPC: reject user
CREATE OR REPLACE FUNCTION public.reject_pending_user(
  _user_id uuid,
  _notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.profiles
  SET status = 'rejected', is_active = false, updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'user', _user_id::text, 'user_rejected',
          jsonb_build_object('notes', _notes));
END;
$$;

-- 5) RPC: deactivate user
CREATE OR REPLACE FUNCTION public.deactivate_user(
  _user_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  UPDATE public.profiles
  SET status = 'inactive', is_active = false, updated_at = now()
  WHERE id = _user_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'user', _user_id::text, 'user_deactivated', '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_pending_user(uuid, app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_pending_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_user(uuid) TO authenticated;