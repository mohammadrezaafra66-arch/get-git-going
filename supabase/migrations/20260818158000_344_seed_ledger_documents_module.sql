-- 344 -- task 1.7 -- seed role_permissions for the new ledger-documents module
--
-- WHY THIS IS MANDATORY, not housekeeping (ground-truth section 9, audit-trigger-spec section 5):
-- has_dynamic_permission grants access to ALL roles when a module has no row at all. An unseeded
-- module is OPEN, not closed. So the module must be seeded before anything references it, not
-- after.
--
-- MODULE NAME -- my choice, recorded because no document fixes it.
-- MASTER-CHECKLIST 1.7 and audit-trigger-spec section 5 both write the name as a placeholder
-- ('<new>' / '<new module>'). Nothing in the programme docs names it. 'ledger-documents' follows
-- the existing kebab-case convention (asan-export, audit-logs, price-lists, platform-releases)
-- and covers the three documents phases 2-4 create plus their numbers and attachments.
--   >>> OG-12: is 'ledger-documents' the right module string? If phase 6's wizard registers a
--   different one, THAT string will be unseeded and therefore open to every role. Whatever name
--   phase 6 uses must be seeded before the wizard ships.
--
-- PERMISSIONS follow audit-trigger-spec section 5 literally: can_view + can_create for admin and
-- accountant; explicit all-false rows for every other role. Never rely on absence.
--
-- NOTE, recorded not resolved: the RLS matrix in the same document (section 4) lets `manager`
-- SELECT document_attachments, while section 5 gives manager nothing here. These govern different
-- mechanisms - RLS controls table access, the module controls dynamic/UI permission - so they can
-- legitimately differ, but the difference is deliberate on my part rather than assumed.
--   >>> OG-13: should manager also get can_view on ledger-documents, to match its RLS SELECT?
--
-- ROLLBACK: docs/verification/344-down.sql
--   CAUTION: deleting these rows makes the module OPEN to every role again, not closed. Only run
--   the down file if the module itself is being removed.

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() <> 'afrakala' THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

-- Seeded from the roles that actually exist, so the set cannot drift from reality.
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name,
       'ledger-documents',
       r.role_name IN ('admin', 'accountant'),   -- can_view
       r.role_name IN ('admin', 'accountant'),   -- can_create
       false,                                    -- can_update: posted documents are immutable (D11)
       r.role_name = 'admin',                    -- can_delete
       false,                                    -- can_approve: approval was removed (T1)
       r.role_name IN ('admin', 'accountant'),   -- can_export
       false                                     -- can_view_sensitive
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_name = r.role_name AND rp.module = 'ledger-documents');

DO $verify$
DECLARE
  _seeded int;
  _total  int;
BEGIN
  SELECT count(DISTINCT role_name) INTO _seeded
    FROM public.role_permissions WHERE module = 'ledger-documents';
  SELECT count(DISTINCT role_name) INTO _total
    FROM public.role_permissions;

  IF _seeded <> _total THEN
    RAISE EXCEPTION '344: seeded % roles but the database has % distinct roles', _seeded, _total;
  END IF;

  IF EXISTS (SELECT 1 FROM public.role_permissions
              WHERE module = 'ledger-documents' AND can_update) THEN
    RAISE EXCEPTION '344: can_update granted on an immutable document module';
  END IF;
END
$verify$;
