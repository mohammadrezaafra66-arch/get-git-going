SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' ORDER BY ordinal_position;
SELECT * FROM public.role_permissions WHERE page_key ILIKE '%deal%' OR page_key ILIKE '%lost%' OR module ILIKE '%deal%' OR route ILIKE '%deal-lost%' LIMIT 5;
