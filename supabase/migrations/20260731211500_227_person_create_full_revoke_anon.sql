SET client_encoding='UTF8';

-- =============================================================================
-- 227 — Revoke EXECUTE on person_create_full from `anon`
-- =============================================================================
--
-- Follow-up hardening to migration 226.
--
-- 226 did `REVOKE ALL ... FROM PUBLIC` then `GRANT EXECUTE ... TO authenticated`.
-- That was not sufficient: Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on
-- new public-schema functions to `anon` and `authenticated` EXPLICITLY, not via
-- the PUBLIC pseudo-role — so revoking PUBLIC left `anon=X/supabase_admin` in
-- place.
--
-- There is no live exposure: person_create_full raises 42501
-- ('احراز هویت لازم است.') when auth.uid() IS NULL, and every INSERT policy it
-- relies on is `TO authenticated`. Verified by executing the function as `anon`
-- before writing this migration — it was correctly rejected.
--
-- This migration closes the gap at the grant layer as well, so the function is
-- not merely guarded but unreachable for unauthenticated callers.
--
-- Not editing 226 in place: it has already been applied (repo rule — never edit
-- an existing migration file, add a new one).
-- =============================================================================

REVOKE ALL ON FUNCTION public.person_create_full(
  text, text, text, text, text, boolean, jsonb, jsonb, text, text, uuid, text
) FROM anon;
