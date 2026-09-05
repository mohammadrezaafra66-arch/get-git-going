-- 339 -- task 1.2 -- fix for a Security Engineer CHANGE raised in review of migration 338
--
-- DEFECT
-- 338 created public.burn_document_number(text, uuid, text) as SECURITY DEFINER with no role
-- gate. New functions in this database inherit EXECUTE for PUBLIC/anon/authenticated (Supabase
-- default privileges), which the catalog confirmed:
--
--   burn_document_number | =X/supabase_admin postgres=X/... anon=X/... authenticated=X/...
--
-- So any caller -- including anon -- could call
--   SELECT burn_document_number('receipt', '<uuid>', 'anything');
-- and burn a live document's number. Burned numbers are deliberately never reissued, so this
-- corrupts the numbering ledger permanently and is not repairable by re-running anything.
--
-- FIX
-- Revoke the direct execute path entirely rather than adding a role gate. The two callers are
-- SECURITY DEFINER trigger functions owned by supabase_admin, which retain EXECUTE as owner, so
-- the burn-on-delete path keeps working. A role gate was rejected deliberately: the burn runs
-- inside an AFTER DELETE trigger, and auth.uid() is NULL for service_role and for any background
-- deletion, so a gate would block legitimate deletes instead of protecting anything.
--
-- This mirrors the pattern in docs/security/audit-trigger-spec.md section 4: no reachable write
-- path at all, so misuse is impossible by construction rather than by check.
--
-- Also tightens assign_document_number: it keeps its in-body role gate (defence in depth) but
-- anon has no business holding EXECUTE on it.
--
-- ROLLBACK: docs/verification/339-down.sql

SET client_encoding = 'UTF8';

DO $guard$
BEGIN
  IF current_database() NOT IN ('afrakala','postgres') THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
END
$guard$;

REVOKE ALL ON FUNCTION public.burn_document_number(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.burn_document_number(text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.burn_document_number(text, uuid, text) FROM authenticated;

REVOKE ALL ON FUNCTION public.assign_document_number(text, uuid) FROM anon;

DO $verify$
DECLARE
  _acl text;
BEGIN
  SELECT COALESCE(array_to_string(p.proacl, ' '), 'DEFAULT')
    INTO _acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'burn_document_number';

  IF _acl LIKE '%anon=X%' OR _acl LIKE '%authenticated=X%' THEN
    RAISE EXCEPTION '339: burn_document_number is still executable by anon/authenticated: %', _acl;
  END IF;

  SELECT COALESCE(array_to_string(p.proacl, ' '), 'DEFAULT')
    INTO _acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'assign_document_number';

  IF _acl LIKE '%anon=X%' THEN
    RAISE EXCEPTION '339: assign_document_number is still executable by anon: %', _acl;
  END IF;
  IF _acl NOT LIKE '%authenticated=X%' THEN
    RAISE EXCEPTION '339: assign_document_number lost its authenticated grant: %', _acl;
  END IF;
END
$verify$;
