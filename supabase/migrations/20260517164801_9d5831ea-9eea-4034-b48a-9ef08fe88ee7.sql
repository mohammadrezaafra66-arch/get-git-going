-- AFRA-20260517-RBAC-U01-S15: seed role_permissions for module='persons'
-- Idempotent: relies on UNIQUE(role_name, module) constraint.
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
VALUES
  ('admin',      'persons', true,  true,  true,  true,  true,  true,  true),
  ('manager',    'persons', true,  true,  true,  false, true,  true,  true),
  ('accountant', 'persons', true,  false, false, false, false, true,  true),
  ('sales',      'persons', true,  false, false, false, false, false, false),
  ('viewer',     'persons', true,  false, false, false, false, false, false)
ON CONFLICT (role_name, module) DO NOTHING;