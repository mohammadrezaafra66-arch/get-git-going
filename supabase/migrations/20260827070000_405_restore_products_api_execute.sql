SET client_encoding='UTF8';

-- 405 — REPAIR. Migration 395 took the internal products-pricing API offline. This restores it,
-- to exactly one role, and gates the class so it cannot recur silently.
--
-- ─── WHAT BROKE ──────────────────────────────────────────────────────────────────────────────
-- 395 revoked EXECUTE on 28 SECURITY DEFINER functions from `anon` and from `PUBLIC`. One of
-- them, `get_product_price_bounds(uuid, uuid)`, was reachable by `products_api_readonly` ONLY
-- through that PUBLIC grant — `docs/verification/395-down.sql:60` captured the pre-state as
-- `GRANT EXECUTE ON FUNCTION public.get_product_price_bounds(uuid,uuid) TO PUBLIC;`. The revoke
-- removed it and granted it back to nobody.
--
-- That role's entire purpose is to SELECT two views. The primary one,
-- `public.api_products_pricing`, calls the function in a LEFT JOIN LATERAL. Measured live before
-- this migration:
--     has_table_privilege(products_api_readonly, api_products_pricing, SELECT) = t
--     has_function_privilege(products_api_readonly, get_product_price_bounds, EXECUTE) = f
--     SET ROLE products_api_readonly; SELECT count(*) FROM public.api_products_pricing;
--       → ERROR 42501: permission denied for function get_product_price_bounds
-- while the role's OTHER view, which calls no function, still returned 990 rows. So the failure
-- is precisely the function grant and nothing else.
--
-- ─── WHY A VIEW DID NOT PROTECT IT ───────────────────────────────────────────────────────────
-- `api_products_pricing` is NOT `security_invoker`, so RELATION access inside it is checked
-- against the view's owner. **Function EXECUTE is not.** A view's rewritten query carries
-- `checkAsUser` on its range-table entries, which is what substitutes the owner for table reads;
-- function calls have no equivalent and are checked against the CURRENT user at execution time.
-- That asymmetry is why "the role can read the view" and "the role can run what the view calls"
-- are two different facts, and why testing only the first one passes while the API is down.
--
-- ─── WHY THE GATE MISSED IT, WHICH IS THE PART WORTH KEEPING ─────────────────────────────────
-- 395's O1 gate asserted that "legitimate roles keep access" — naming `authenticated` and
-- `service_role`. `products_api_readonly` is neither. It is NOINHERIT and request-facing:
-- `authenticator` is a MEMBER of it and PostgREST `SET ROLE`s into it from a JWT claim, so it
-- never appears in an inheritance-based check.
--
-- **This project had already written that lesson down, two days earlier.** Migration 385's
-- repair of 384's gate is recorded in `docs/execution/00-progress.md:622`:
--     "pg_has_role(...,'USAGE') tests INHERIT, 'MEMBER' tests SET ROLE … products_api_readonly
--      and authenticator are both NOINHERIT, exactly the two roles a USAGE check is blind to."
-- 395 was written on 2026-08-26 and still enumerated only `authenticated` and `service_role`.
-- Same shape as the `persons` FK registry (shipped three times) and the REVOKE-then-GRANT trap
-- (recorded as having bitten this project four times): the lesson existed, in this repository,
-- and the next migration did not consult it.
--
-- ─── SCOPE: ONE GRANT, TO ONE ROLE ───────────────────────────────────────────────────────────
-- Not `TO PUBLIC` — that would undo what 395 correctly closed, since the point of the revoke was
-- that `anon` should not reach this function. `products_api_readonly` is named explicitly.
--
-- **AND IT MUST NOT DISTURB OG-45.** The same general query — "roles that can SELECT a view
-- which calls a function they cannot EXECUTE" — returns 12 rows today. Eleven of them are
-- `supabase_read_only_user`, and those are DELIBERATE: migration 393 asserts that role is
-- blocked from eight such views, and two of the blocks come from `_capital_alloc_used` rather
-- than `is_viewer_only`. One row is the bug. A repair that "fixed" all 12 would silently
-- dismantle a security pin, so the assertion below proves that role's position is unchanged.

GRANT EXECUTE ON FUNCTION public.get_product_price_bounds(uuid, uuid) TO products_api_readonly;

DO $verify$
DECLARE
  v_rows  int;
  v_srou  int;
BEGIN
  -- CLOSED: the role can execute it again.
  IF NOT has_function_privilege('products_api_readonly',
                                'public.get_product_price_bounds(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '405: products_api_readonly still cannot execute get_product_price_bounds';
  END IF;

  -- And `anon` must NOT have got it back. 395 was right about anon; this repairs a different role.
  IF has_function_privilege('anon', 'public.get_product_price_bounds(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '405: anon regained EXECUTE — the repair undid what 395 correctly closed';
  END IF;

  -- BEHAVIOURAL: the API actually serves rows again. A grant that is present but insufficient
  -- would satisfy every catalogue check above.
  PERFORM set_config('role', 'products_api_readonly', true);
  SELECT count(*) INTO v_rows FROM public.api_products_pricing;
  PERFORM set_config('role', 'none', true);
  IF v_rows IS NULL OR v_rows = 0 THEN
    RAISE EXCEPTION '405: the view returned no rows for products_api_readonly';
  END IF;
  RAISE NOTICE '405: api_products_pricing serves % rows to products_api_readonly again', v_rows;

  -- OG-45 UNCHANGED. supabase_read_only_user must STILL be blocked from the views migration 393
  -- pinned. A repair that widened this class would dismantle that pin without saying so.
  SELECT count(*) INTO v_srou
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_rewrite rw ON rw.ev_class = c.oid
    JOIN pg_depend d ON d.objid = rw.oid AND d.classid = 'pg_rewrite'::regclass
    JOIN pg_proc p ON p.oid = d.refobjid AND d.refclassid = 'pg_proc'::regclass
   WHERE c.relkind = 'v'
     AND has_table_privilege('supabase_read_only_user', c.oid, 'SELECT')
     AND NOT has_function_privilege('supabase_read_only_user', p.oid, 'EXECUTE');
  IF v_srou < 11 THEN
    RAISE EXCEPTION '405: supabase_read_only_user is blocked from only % view/function pairs (expected at least 11) — OG-45''s pin has been weakened', v_srou;
  END IF;
  RAISE NOTICE '405: OG-45 intact — supabase_read_only_user still blocked on % view/function pairs', v_srou;
END
$verify$;
