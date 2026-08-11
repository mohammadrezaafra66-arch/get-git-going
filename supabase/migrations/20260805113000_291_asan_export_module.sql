-- 291: the Asan export module (M4.2) — permissions for every role, and batch numbering.
--
-- Two things the shell needs before any export exists:
--
--  1. `role_permissions` rows for the module `asan-export` for **every** role. Rule 2.5:
--     `has_dynamic_permission` grants access to ALL roles when a module has no row at all, so
--     an unseeded module is an open door rather than a closed one. Only admin and accountant
--     get can_view; the other roles get an explicit row with everything false.
--
--  2. A batch form of migration 290's assignment. The single-document function is correct but
--     one HTTP round trip per document does not scale to a purchase register with 289 rows,
--     and doing it in a loop client-side would also mean a half-numbered export if the browser
--     is closed midway. The batch runs in one transaction: either every selected document has
--     a number or none does.
--
-- Rollback: docs/verification/291-down.sql
SET client_encoding='UTF8';

INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name, 'asan-export',
       r.role_name IN ('admin','accountant'),   -- view
       false,                                   -- create: an export creates no business data
       false,                                   -- update
       r.role_name = 'admin',                   -- delete
       false,                                   -- approve
       r.role_name IN ('admin','accountant'),   -- export
       r.role_name = 'admin'                    -- sensitive
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp
                    WHERE rp.role_name = r.role_name AND rp.module = 'asan-export');

-- ------------------------------------------------------------ batch numbers ----
CREATE OR REPLACE FUNCTION public.asan_assign_document_numbers(_doc_type text, _ids uuid[])
RETURNS TABLE (source_id uuid, asan_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _id uuid;
BEGIN
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Ordered, so a batch of new documents is numbered in a predictable order rather than in
  -- whatever order the client happened to send. The per-document function does the permission
  -- check, the validation and the locking; this is a loop, not a second implementation.
  FOREACH _id IN ARRAY (SELECT array_agg(x ORDER BY x) FROM unnest(_ids) AS t(x))
  LOOP
    PERFORM public.asan_assign_document_number(_doc_type, _id);
  END LOOP;

  RETURN QUERY
    SELECT n.source_id, n.asan_number
      FROM public.asan_export_numbers n
     WHERE n.doc_type = _doc_type
       AND n.source_id = ANY (_ids)
     ORDER BY n.asan_number;
END;
$fn$;

REVOKE ALL ON FUNCTION public.asan_assign_document_numbers(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.asan_assign_document_numbers(text, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.asan_assign_document_numbers(text, uuid[]) IS
  'ASAN M4.2: assign Asan numbers to many documents in one transaction. Idempotent, and all-or-nothing.';

-- --------------------------------------------------------------------- gate ----
DO $chk$
DECLARE n integer; roles integer;
BEGIN
  SELECT count(DISTINCT role_name) INTO roles FROM public.role_permissions;
  SELECT count(*) INTO n FROM public.role_permissions WHERE module = 'asan-export';
  IF n <> roles THEN
    RAISE EXCEPTION 'asan-export must have a row for all % roles, found %', roles, n;
  END IF;

  SELECT count(*) INTO n FROM public.role_permissions
   WHERE module = 'asan-export' AND can_view AND role_name NOT IN ('admin','accountant');
  IF n <> 0 THEN RAISE EXCEPTION '% non-privileged roles can view asan-export', n; END IF;

  SELECT count(*) INTO n FROM public.role_permissions
   WHERE module = 'asan-export' AND role_name IN ('admin','accountant') AND NOT can_view;
  IF n <> 0 THEN RAISE EXCEPTION 'asan-export hidden from a role that needs it'; END IF;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF n <> 0 THEN RAISE EXCEPTION '% tables in public have RLS disabled', n; END IF;
END
$chk$;
