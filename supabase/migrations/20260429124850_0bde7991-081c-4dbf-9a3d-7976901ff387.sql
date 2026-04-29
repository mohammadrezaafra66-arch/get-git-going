
-- 1. role_permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name text NOT NULL,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_create boolean NOT NULL DEFAULT false,
  can_update boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  can_view_sensitive boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_name, module)
);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_name ON public.role_permissions(role_name);
CREATE INDEX IF NOT EXISTS idx_role_permissions_module ON public.role_permissions(module);
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_permissions_read_authed" ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "role_permissions_write_admin" ON public.role_permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_role_permissions_set_updated_at BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. custom_roles
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custom_roles_read_authed" ON public.custom_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "custom_roles_write_admin" ON public.custom_roles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_custom_roles_set_updated_at BEFORE UPDATE ON public.custom_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.custom_roles (name, display_name, is_system, is_active) VALUES
  ('admin', 'مدیر کل', true, true),
  ('manager', 'مدیر بخش', true, true),
  ('sales', 'فروشنده', true, true),
  ('accountant', 'حسابدار', true, true),
  ('viewer', 'بیننده', true, true)
ON CONFLICT (name) DO UPDATE SET is_system = true;

-- 3. Seed permissions
DO $seed$
DECLARE
  modules text[] := ARRAY[
    'dashboard','products','pricing','purchases','sales','invoices',
    'price-lists','users','roles','reports','knowledge','feedback',
    'messages','audit-logs','data-tables','bot-api-keys','suppliers','academy'
  ];
  m text;
BEGIN
  FOREACH m IN ARRAY modules LOOP
    INSERT INTO public.role_permissions (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
    VALUES ('admin', m, true, true, true, true, true, true, true)
    ON CONFLICT (role_name, module) DO NOTHING;
  END LOOP;

  INSERT INTO public.role_permissions (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive) VALUES
    ('manager','dashboard',true,false,false,false,false,true,false),
    ('manager','products',true,true,true,false,false,true,true),
    ('manager','pricing',true,true,true,false,true,true,true),
    ('manager','purchases',true,true,true,false,true,true,true),
    ('manager','sales',true,true,true,false,true,true,true),
    ('manager','invoices',true,true,true,false,true,true,true),
    ('manager','price-lists',true,true,true,false,false,true,false),
    ('manager','users',false,false,false,false,false,false,false),
    ('manager','roles',false,false,false,false,false,false,false),
    ('manager','reports',true,false,false,false,false,true,true),
    ('manager','knowledge',true,true,true,false,false,true,false),
    ('manager','feedback',true,true,true,false,true,true,false),
    ('manager','messages',true,true,true,false,false,false,false),
    ('manager','audit-logs',false,false,false,false,false,false,false),
    ('manager','data-tables',true,true,true,false,false,true,false),
    ('manager','bot-api-keys',true,true,true,true,false,false,false),
    ('manager','suppliers',true,false,false,false,false,true,true),
    ('manager','academy',true,true,true,true,false,false,false)
  ON CONFLICT (role_name, module) DO NOTHING;

  INSERT INTO public.role_permissions (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive) VALUES
    ('sales','dashboard',true,false,false,false,false,false,false),
    ('sales','products',false,false,false,false,false,false,false),
    ('sales','pricing',false,false,false,false,false,false,false),
    ('sales','purchases',false,false,false,false,false,false,false),
    ('sales','sales',true,true,true,false,false,true,false),
    ('sales','invoices',true,true,true,false,false,true,false),
    ('sales','price-lists',true,false,false,false,false,false,false),
    ('sales','users',false,false,false,false,false,false,false),
    ('sales','roles',false,false,false,false,false,false,false),
    ('sales','reports',true,false,false,false,false,true,false),
    ('sales','knowledge',true,false,false,false,false,false,false),
    ('sales','feedback',true,true,false,false,false,false,false),
    ('sales','messages',true,true,true,false,false,false,false),
    ('sales','audit-logs',false,false,false,false,false,false,false),
    ('sales','data-tables',false,false,false,false,false,false,false),
    ('sales','bot-api-keys',false,false,false,false,false,false,false),
    ('sales','suppliers',false,false,false,false,false,false,false),
    ('sales','academy',true,false,false,false,false,false,false)
  ON CONFLICT (role_name, module) DO NOTHING;

  INSERT INTO public.role_permissions (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive) VALUES
    ('accountant','dashboard',true,false,false,false,false,true,false),
    ('accountant','products',false,false,false,false,false,false,false),
    ('accountant','pricing',true,true,true,false,true,true,true),
    ('accountant','purchases',true,false,false,false,false,true,true),
    ('accountant','sales',true,false,false,false,false,true,true),
    ('accountant','invoices',true,false,false,false,false,true,true),
    ('accountant','price-lists',true,false,false,false,false,true,false),
    ('accountant','users',false,false,false,false,false,false,false),
    ('accountant','roles',false,false,false,false,false,false,false),
    ('accountant','reports',true,false,false,false,false,true,true),
    ('accountant','knowledge',true,false,false,false,false,false,false),
    ('accountant','feedback',true,true,false,false,false,false,false),
    ('accountant','messages',true,true,true,false,false,false,false),
    ('accountant','audit-logs',false,false,false,false,false,false,false),
    ('accountant','data-tables',true,false,false,false,false,true,false),
    ('accountant','bot-api-keys',false,false,false,false,false,false,false),
    ('accountant','suppliers',true,true,true,false,false,true,true),
    ('accountant','academy',true,false,false,false,false,false,false)
  ON CONFLICT (role_name, module) DO NOTHING;

  INSERT INTO public.role_permissions (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive) VALUES
    ('viewer','dashboard',true,false,false,false,false,false,false),
    ('viewer','products',false,false,false,false,false,false,false),
    ('viewer','pricing',false,false,false,false,false,false,false),
    ('viewer','purchases',true,false,false,false,false,false,false),
    ('viewer','sales',true,false,false,false,false,false,false),
    ('viewer','invoices',true,false,false,false,false,false,false),
    ('viewer','price-lists',true,false,false,false,false,false,false),
    ('viewer','users',false,false,false,false,false,false,false),
    ('viewer','roles',false,false,false,false,false,false,false),
    ('viewer','reports',true,false,false,false,false,false,false),
    ('viewer','knowledge',true,false,false,false,false,false,false),
    ('viewer','feedback',true,true,false,false,false,false,false),
    ('viewer','messages',true,true,true,false,false,false,false),
    ('viewer','audit-logs',false,false,false,false,false,false,false),
    ('viewer','data-tables',true,false,false,false,false,false,false),
    ('viewer','bot-api-keys',false,false,false,false,false,false,false),
    ('viewer','suppliers',false,false,false,false,false,false,false),
    ('viewer','academy',true,false,false,false,false,false,false)
  ON CONFLICT (role_name, module) DO NOTHING;
END
$seed$;

-- 4. RPCs
CREATE OR REPLACE FUNCTION public.create_custom_role(_name text, _display_name text DEFAULT NULL, _description text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE new_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF _name IS NULL OR length(_name) < 2 OR length(_name) > 50 THEN RAISE EXCEPTION 'invalid role name length'; END IF;
  IF _name !~ '^[a-z_][a-z0-9_]*$' THEN RAISE EXCEPTION 'role name must be lowercase letters/digits/underscores'; END IF;

  INSERT INTO public.custom_roles (name, display_name, description, is_system, is_active, created_by)
  VALUES (_name, COALESCE(_display_name, _name), _description, false, true, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'role', new_id::text, 'role_created', jsonb_build_object('name', _name, 'display_name', _display_name));
  RETURN new_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.toggle_custom_role_status(_role_id uuid, _is_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE r public.custom_roles%ROWTYPE;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'permission denied'; END IF;
  SELECT * INTO r FROM public.custom_roles WHERE id = _role_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'role not found'; END IF;
  IF r.is_system THEN RAISE EXCEPTION 'cannot disable system roles'; END IF;

  UPDATE public.custom_roles SET is_active = _is_active, updated_at = now() WHERE id = _role_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'role', _role_id::text, 'role_status_changed',
          jsonb_build_object('name', r.name, 'old', r.is_active, 'new', _is_active));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.update_role_permissions(_role_name text, _permissions jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  rec jsonb;
  changed_modules text[] := ARRAY[]::text[];
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'permission denied'; END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(_permissions) LOOP
    INSERT INTO public.role_permissions (
      role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive
    ) VALUES (
      _role_name,
      rec->>'module',
      COALESCE((rec->>'can_view')::boolean, false),
      COALESCE((rec->>'can_create')::boolean, false),
      COALESCE((rec->>'can_update')::boolean, false),
      COALESCE((rec->>'can_delete')::boolean, false),
      COALESCE((rec->>'can_approve')::boolean, false),
      COALESCE((rec->>'can_export')::boolean, false),
      COALESCE((rec->>'can_view_sensitive')::boolean, false)
    )
    ON CONFLICT (role_name, module) DO UPDATE SET
      can_view = EXCLUDED.can_view,
      can_create = EXCLUDED.can_create,
      can_update = EXCLUDED.can_update,
      can_delete = EXCLUDED.can_delete,
      can_approve = EXCLUDED.can_approve,
      can_export = EXCLUDED.can_export,
      can_view_sensitive = EXCLUDED.can_view_sensitive,
      updated_at = now();
    changed_modules := array_append(changed_modules, rec->>'module');
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'role_permissions', _role_name, 'role_permissions_updated',
          jsonb_build_object('role_name', _role_name, 'modules', to_jsonb(changed_modules)));
END;
$fn$;
