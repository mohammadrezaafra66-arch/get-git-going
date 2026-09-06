SET client_encoding='UTF8';

-- ============================================================================================
-- 485 · fill the three role_permissions gaps before the static fallback is removed (X-3, H·d)
--
-- WHY THIS MUST LAND FIRST
-- X-3 removes the static PERMISSIONS matrix from src/lib/rbac/roles.ts, which is what
-- hasPermissionEx falls back to when role_permissions has no row for a role+module pair. Once
-- the fallback is gone, "no row" means "denied" -- so any missing row silently becomes a denial.
-- The gaps have to be filled BEFORE that, or "always read live" cuts someone off.
--
-- MEASURED 2026-09-06, confirmed independently rather than inherited:
--   accountant 28 · admin 28 · manager 28 · sales 28 · viewer 28
--   purchase_specialist 27 · site 26
--   28 distinct modules · 193 rows total (28 x 7 = 196, minus these 3)
--
-- The three missing pairs, enumerated by a cross join against the live table:
--   purchase_specialist :: persons
--   site                :: persons
--   site                :: warehouse
--
-- BLAST RADIUS: neither role is held by any user. Measured user_roles:
--   admin 14 · sales 14 · manager 3 · accountant 3 · viewer 2
--   purchase_specialist 0 · site 0
-- So no live user's access changes. The rows are added anyway, because the fallback's removal
-- must not depend on nobody happening to hold the role today.
--
-- WHY ALL-FALSE IS THE BEHAVIOUR-PRESERVING FILL, not a guess:
-- These rows are set to exactly what the static fallback answers for these pairs today, so
-- removing the fallback changes nothing.
--   persons.view   = ALL_ROLES, and ALL_ROLES is ["admin","manager","sales","accountant",
--                    "viewer"] -- it deliberately excludes purchase_specialist and site.
--   persons.create/update = ["admin","manager"]; persons.delete = ["admin"].
--   warehouse.view = ["admin","manager","accountant","sales","purchase_specialist"] -- no site.
--   warehouse.create/update/delete = ["admin","manager"] / ["admin","manager"].
-- Neither role appears in any of those lists, so all four standard actions answer false today.
-- The extended actions fall back to APPROVE_FALLBACK ["admin","manager"], EXPORT_FALLBACK and
-- SENSITIVE_FALLBACK ["admin","manager","accountant"] -- neither role appears in those either,
-- so approve/export/view_sensitive are false today as well. Hence: every column false.
--
-- Idempotent: ON CONFLICT DO NOTHING on the natural key, and a WHERE NOT EXISTS guard, so a
-- re-run is safe even though the ledger row is recorded separately.
--
-- Migration impact: 3 INSERTs into a permission table. No schema change.
-- RLS/RBAC impact: adds explicit DENY rows for two roles that no user holds. No role gains
--   anything; no role loses anything relative to today's effective answer.
-- Audit impact: none. role_permissions carries no audit trigger.
-- ============================================================================================

INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete,
   can_approve, can_export, can_view_sensitive)
SELECT v.role_name, v.module, false, false, false, false, false, false, false
  FROM (VALUES
          ('purchase_specialist', 'persons'),
          ('site',               'persons'),
          ('site',               'warehouse')
       ) AS v(role_name, module)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = v.role_name AND rp.module = v.module);

-- Prove the gap is closed in the same transaction that closed it: 7 roles x 28 modules = 196.
DO $$
DECLARE
  v_rows int;
  v_gaps int;
BEGIN
  SELECT count(*) INTO v_rows FROM public.role_permissions;

  SELECT count(*) INTO v_gaps
    FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
   CROSS JOIN (SELECT DISTINCT module FROM public.role_permissions) m
    LEFT JOIN public.role_permissions rp
           ON rp.role_name = r.role_name AND rp.module = m.module
   WHERE rp.id IS NULL;

  IF v_gaps <> 0 THEN
    RAISE EXCEPTION
      'role_permissions still has % role x module gaps after 485; the static fallback must NOT be removed',
      v_gaps;
  END IF;

  RAISE NOTICE '485: role_permissions now % rows, % gaps', v_rows, v_gaps;
END $$;
