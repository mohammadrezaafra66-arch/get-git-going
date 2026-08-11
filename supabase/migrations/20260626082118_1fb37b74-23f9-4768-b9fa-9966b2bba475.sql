DROP VIEW IF EXISTS public.publish_recipients_view;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT public.has_role(_user_id, _role::text) $$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT public.has_any_role(_user_id, _roles::text[]) $$;

CREATE OR REPLACE FUNCTION public.assign_user_role(_target_user uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$ BEGIN PERFORM public.assign_user_role_txt(_target_user, _role::text); END; $$;

CREATE OR REPLACE FUNCTION public.revoke_user_role(_target_user uuid, _role public.app_role)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$ BEGIN PERFORM public.revoke_user_role_txt(_target_user, _role::text); END; $$;

ALTER TABLE public.user_roles ALTER COLUMN role TYPE TEXT USING role::TEXT;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles)) $$;

CREATE VIEW public.publish_recipients_view AS
SELECT p.id, p.full_name,
       array_agg(ur.role ORDER BY ur.role) AS roles
FROM public.profiles p
JOIN public.user_roles ur ON ur.user_id = p.id
WHERE p.is_active = true
  AND ur.role = ANY(ARRAY['admin','manager','accountant','sales'])
GROUP BY p.id, p.full_name;

GRANT SELECT ON public.publish_recipients_view TO authenticated;
GRANT ALL ON public.publish_recipients_view TO service_role;