-- Add two new roles to the app_role enum (safe additive change).
-- Existing policies/functions using has_role/has_any_role continue to work unchanged.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'purchase_specialist';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'site';

-- Seed matching rows in public.custom_roles so the roles page shows them
-- and any lookup by name resolves correctly. Idempotent via ON CONFLICT.
INSERT INTO public.custom_roles (name, display_name, is_active, is_system)
VALUES
  ('purchase_specialist', 'کارشناس خرید', true, true),
  ('site',                'سایت',          true, true)
ON CONFLICT (name) DO NOTHING;