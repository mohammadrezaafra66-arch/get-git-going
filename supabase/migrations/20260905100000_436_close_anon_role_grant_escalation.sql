SET client_encoding='UTF8';

-- 436 - close the anon privilege escalation into the role-granting RPCs, and the three other
-- ungated SECURITY DEFINER writers that were still reachable by anon.
--
-- ASCII-ONLY BY DESIGN. Every message added here is an API-level refusal, not a UI string, so
-- this file carries no Persian and cannot be damaged by an encoding-mangling transport. The
-- 11 Tir 1405 incident is the reason that matters.
--
-- ============================================================================
-- WHAT WAS OPEN, measured 2026-09-05 through real PostgREST with the public anon key
-- ============================================================================
--
-- An invalid enum literal was used so that nothing could be written even if the call was
-- accepted; execution entered the body and failed only on the cast:
--
--     POST /rest/v1/rpc/assign_user_role_txt   {"_role":"__probe_invalid_role__", ...}
--     HTTP 400 {"code":"22P02","message":"invalid input value for enum app_role: ..."}
--     POST /rest/v1/rpc/assign_user_role       -> identical
--     POST /rest/v1/rpc/revoke_user_role       -> identical
--
--     CONTROL, same key, a function 399 already closed:
--     POST /rest/v1/rpc/capture_score_snapshots
--     HTTP 401 {"code":"42501","message":"permission denied for function ..."}
--
-- With "_role":"admin" the same path would have INSERTed the row. `assign_user_role_txt` is
-- SECURITY DEFINER, owned by supabase_admin (superuser, bypassrls), and its entire body is an
-- INSERT with no authorization check -- `auth.uid()` appears only as a VALUE for `assigned_by`,
-- never as a test. RLS on `user_roles` does not help: relforcerowsecurity is false and the
-- definer bypasses it.
--
-- THREE MORE FOUND BY ENUMERATING THE CLASS RATHER THAN THE THREE REPORTED NAMES:
--
--   * `log_event` - PROVEN by an actual write, not inferred. The probe returned HTTP 204 and
--     left row id 61265 in `audit_logs` with actor_id NULL. An unauthenticated caller can
--     forge audit entries. That row is deliberately NOT deleted here: removing an audit row to
--     tidy up an audit-forgery finding is itself an unlogged mutation of the audit trail.
--   * `apply_stock_movement` - 80 lines, argument validation only, zero authorization, and
--     anon-reachable. Anon could move warehouse stock.
--
-- ============================================================================
-- WHY 399 DID NOT COVER THESE - and why that is the part worth fixing
-- ============================================================================
--
-- Migration 399 closed 26 functions after an anon caller really did strip an administrator
-- (`user_roles` admins 14 -> 13). It closed `revoke_user_role_txt`. It did not close the
-- `assign` variant or either `app_role` wrapper, because its subject list is 26 names written
-- out by hand -- in the migration and again in
-- `e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts`. A hand-written list cannot
-- notice a function nobody added to it.
--
-- Note the shape of the miss: `revoke_user_role_txt` ended up anon=false while its own wrapper
-- `revoke_user_role` stayed anon=true and delegated straight into it. The wrapper was a second
-- door to the same room and only the first was locked. The wrappers also escape any
-- "SECURITY DEFINER function that writes" detector, because they contain no INSERT/UPDATE/
-- DELETE of their own -- only a PERFORM. The companion spec change closes that blind spot.
--
-- 399's own header already named this follow-up as OG-74:
--     "these functions still have no INTERNAL guard, so any *authenticated* user - `sales`,
--      `viewer` - can still call `revoke_user_role_txt` and strip an administrator."
-- That is fixed here for the role pair. Grants alone are one GRANT away from being lost, so
-- every function below that has a legitimate direct caller gets a check inside its body too.
--
-- ============================================================================
-- SCOPE, and what is deliberately NOT done
-- ============================================================================
--
-- NOT dropped: the two `app_role` wrappers are gated, not deleted. Retiring them is a separate
-- decision, and the `app_role` overloads interact with the has_role/has_any_role overload pair
-- that cannot be dropped.
--
-- NOT given a body guard: `apply_stock_movement`. Its only legitimate callers are
-- `adjust_warehouse_stock` (already admin/manager gated) and three triggers -
-- `trg_purchase_item_stock_in`, `trg_sales_quote_stock_out`, `trg_stock_transfer_confirm`.
-- Those triggers fire when an ordinary `sales` user confirms a quote, so a role check in the
-- body would BREAK the sale, not secure it. Nested calls from a SECURITY DEFINER function run
-- as the definer and do not consult the caller's EXECUTE grant, so revoking the direct grant
-- closes the API surface while leaving every internal path intact. No frontend code calls it
-- directly: `grep -rn "apply_stock_movement" src server` returns nothing.
--
-- `user_roles.role` is TEXT on this database, so every check below uses the
-- has_any_role(uuid, text[]) overload with an explicit ::text[] cast. The bare-literal form
-- is ambiguous against the app_role overload. has_any_role(NULL, ...) returns false, verified,
-- so an unauthenticated caller is refused by the same expression.

-- ---------------------------------------------------------------------------
-- 1. Remove the unauthenticated path. Same shape as 399: anon AND PUBLIC.
--    The `=X/supabase_admin` entry in proacl is a PUBLIC grant; revoking anon alone leaves it.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.assign_user_role_txt(_target_user uuid, _role text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_user_role_txt(_target_user uuid, _role text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.revoke_user_role_txt(_target_user uuid, _role text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_user_role_txt(_target_user uuid, _role text) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.assign_user_role(_target_user uuid, _role app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_user_role(_target_user uuid, _role app_role) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.revoke_user_role(_target_user uuid, _role app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_user_role(_target_user uuid, _role app_role) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.log_event(_entity_type text, _entity_id text, _action text, _diff jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_event(_entity_type text, _entity_id text, _action text, _diff jsonb) FROM PUBLIC;

-- recompute_all_employee_scores: found by enumerating the class, not reported. No guard, writes
-- employee_scores through calculate_employee_score, and anon-reachable. No caller anywhere in
-- src/ or server/, so like apply_stock_movement it loses authenticated as well.
REVOKE EXECUTE ON FUNCTION public.recompute_all_employee_scores() FROM anon;
REVOKE EXECUTE ON FUNCTION public.recompute_all_employee_scores() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_all_employee_scores() FROM authenticated;

-- apply_stock_movement has no legitimate DIRECT caller at all, so authenticated goes too.
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement(_product_id uuid, _warehouse_id uuid, _movement_type text, _quantity numeric, _ref_type text, _ref_id uuid, _related_warehouse_id uuid, _note text, _created_by uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement(_product_id uuid, _warehouse_id uuid, _movement_type text, _quantity numeric, _ref_type text, _ref_id uuid, _related_warehouse_id uuid, _note text, _created_by uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_stock_movement(_product_id uuid, _warehouse_id uuid, _movement_type text, _quantity numeric, _ref_type text, _ref_id uuid, _related_warehouse_id uuid, _note text, _created_by uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. Authorization inside the bodies, so the rule survives a lost GRANT.
--    Each body below is the LIVE definition read with pg_get_functiondef on 2026-09-05,
--    with only the guard added. Behaviour for an authorized caller is unchanged.
-- ---------------------------------------------------------------------------

-- The UI path is /roles, whose route guard is requireAdmin() (src/routes/_app.roles.tsx:14),
-- and it calls these two at :58 and :64. Admin-only here matches that exactly.

CREATE OR REPLACE FUNCTION public.assign_user_role_txt(_target_user uuid, _role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin']::text[]) THEN
    RAISE EXCEPTION 'forbidden: only an admin may assign a role'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_roles (user_id, role, assigned_by)
  VALUES (_target_user, _role::public.app_role, auth.uid())
  ON CONFLICT (user_id, role) DO NOTHING;
END; $function$;

CREATE OR REPLACE FUNCTION public.revoke_user_role_txt(_target_user uuid, _role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin']::text[]) THEN
    RAISE EXCEPTION 'forbidden: only an admin may revoke a role'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _target_user AND role::text = _role;
END; $function$;

-- The two app_role wrappers. They already delegate into the guarded functions above, so they
-- are covered transitively; the explicit check is kept anyway so that reading either one on
-- its own shows the rule, and so a future edit to the delegate cannot silently widen them.

CREATE OR REPLACE FUNCTION public.assign_user_role(_target_user uuid, _role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin']::text[]) THEN
    RAISE EXCEPTION 'forbidden: only an admin may assign a role'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assign_user_role_txt(_target_user, _role::text);
END; $function$;

CREATE OR REPLACE FUNCTION public.revoke_user_role(_target_user uuid, _role app_role)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin']::text[]) THEN
    RAISE EXCEPTION 'forbidden: only an admin may revoke a role'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.revoke_user_role_txt(_target_user, _role::text);
END; $function$;

-- log_event is called by ordinary users, not admins: src/lib/auth/AuthProvider.tsx:79 logs a
-- successful login and :104 logs a logout. Both fire while the session is still valid, so
-- auth.uid() is set. The rule is therefore "any authenticated user", not "admin" - anything
-- narrower would silently stop recording logins.
-- The DEFAULT on _diff is preserved; dropping it would break both callers, which omit it.

CREATE OR REPLACE FUNCTION public.log_event(_entity_type text, _entity_id text, _action text, _diff jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'forbidden: audit events may only be written by an authenticated caller'
      using errcode = '42501';
  end if;

  insert into public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  values (auth.uid(), _entity_type, _entity_id, _action, _diff);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Verify, in the same transaction. 399 ends the same way: re-run the attack.
--    Aimed at the all-zeros uuid, never a real administrator - the whole point of a gate that
--    proves a destructive action is refused is that it must not be able to cause the damage.
-- ---------------------------------------------------------------------------

DO $verify$
DECLARE
  v_fn   text;
  v_open text[] := '{}';
BEGIN
  -- 3a. anon must hold EXECUTE on none of them.
  FOR v_fn IN
    SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('assign_user_role_txt','revoke_user_role_txt',
                        'assign_user_role','revoke_user_role',
                        'log_event','apply_stock_movement','recompute_all_employee_scores')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    v_open := v_open || v_fn;
  END LOOP;

  IF array_length(v_open, 1) IS NOT NULL THEN
    RAISE EXCEPTION '436: anon still holds EXECUTE on: %', array_to_string(v_open, ', ');
  END IF;
  RAISE NOTICE '436: verified - anon holds EXECUTE on none of the seven';

  -- 3b. the live attack, as anon, against a harmless target.
  BEGIN
    PERFORM set_config('role', 'anon', true);
    PERFORM public.assign_user_role_txt('00000000-0000-0000-0000-000000000000', 'admin');
    PERFORM set_config('role', 'none', true);
    RAISE EXCEPTION '436: anon STILL assigned a role - the fix does not work';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('role', 'none', true);
    RAISE NOTICE '436: verified - anon assign_user_role_txt refused with 42501';
  END;

  -- 3c. an AUTHENTICATED non-admin must also be refused, and by the body, not the grant.
  --     set_config('role','authenticated') passes the grant check; request.jwt.claims with a
  --     non-admin sub is what the body sees. This is the OG-74 half that 399 left open.
  BEGIN
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims',
      '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true);
    PERFORM public.assign_user_role_txt('00000000-0000-0000-0000-000000000000', 'admin');
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION '436: an authenticated NON-ADMIN still assigned a role';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE NOTICE '436: verified - authenticated non-admin refused by the body guard';
  END;
END
$verify$;
