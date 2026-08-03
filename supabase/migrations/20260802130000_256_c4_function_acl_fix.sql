SET client_encoding='UTF8';

-- =============================================================================
-- Issue 219 / C4 — forward-only ACL fix for the functions added in 254 and 255
-- =============================================================================
-- Found by test J3 of the C4 suite.
--
-- Supabase's default privileges grant EXECUTE on every new function in `public`
-- to BOTH `anon` and `authenticated`. `REVOKE ... FROM PUBLIC` does not undo
-- that, because the grant to `anon` is a real, explicit grant rather than
-- something inherited from PUBLIC. Migrations 251, 252 and 253 got this right
-- and revoked `FROM PUBLIC, anon`; 254 and 255 revoked only `FROM PUBLIC`, so
-- their functions ended up callable by the anonymous role.
--
-- Two of those are worse than the rest:
--
--   * get_purchase_requests had been correctly locked down by 253. Migration
--     255 dropped the 4-argument signature and created a 5-argument one, and
--     the new function was born with the default grant. That is a REGRESSION
--     introduced by C4, not a pre-existing condition.
--
--   * assign_purchase_request and set_default_purchase_assignee are writers.
--
-- In practice every one of these functions calls auth.uid() and refuses a NULL
-- caller, so an anonymous request is rejected inside the function body. That is
-- the second line of defence, not the first: the first is not being callable at
-- all. This migration restores it.
--
-- 254 and 255 are left exactly as applied. The project's rule is that an
-- applied migration is history, and history is corrected by adding to it.
-- =============================================================================

REVOKE ALL ON FUNCTION
  public.is_valid_purchase_assignee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.is_valid_purchase_assignee(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.get_default_purchase_assignee() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_default_purchase_assignee() TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.get_purchase_assignee_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_purchase_assignee_options() TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.set_default_purchase_assignee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.set_default_purchase_assignee(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.create_purchase_request(uuid, numeric, text, uuid, text, numeric, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.create_purchase_request(uuid, numeric, text, uuid, text, numeric, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.assign_purchase_request(uuid, uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.assign_purchase_request(uuid, uuid, text, uuid, boolean)
  TO authenticated, service_role;

-- Restores exactly what migration 253 had set before 255 replaced the function.
REVOKE ALL ON FUNCTION
  public.get_purchase_requests(text, uuid, integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_purchase_requests(text, uuid, integer, integer, boolean)
  TO authenticated, service_role;
