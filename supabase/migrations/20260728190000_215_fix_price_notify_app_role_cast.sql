SET client_encoding='UTF8';

-- ============================================================================
-- 215 - Fix: operator does not exist: text = app_role
-- ============================================================================
-- ROOT CAUSE (reproduced, SQLSTATE 42883)
--   public.notify_accountants_on_sale_price_change() is an AFTER INSERT trigger
--   on public.product_sale_price_history. Its recipient loop reads:
--
--       WHERE ur.role = 'accountant'::app_role
--
--   but public.user_roles.role is of type TEXT, not app_role. Postgres has no
--   operator for `text = app_role`, so the trigger raises and takes the whole
--   INSERT with it.
--
--   That INSERT is the last link in the "calculate and publish prices" chain
--   (publish-prices.ts -> calculateSalePrice(force_snapshot: true) -> history
--   insert), which is why the button failed for EVERY product. The trigger only
--   reaches the bad line when the price actually changed, and a first-ever
--   computation always counts as a change - hence no product could get past it.
--
--   Introduced by migration 126 (20260716162000). Consistent with the data:
--   product_sale_price_history stops at 2026-07-13 and product_computed_prices
--   at 2026-07-21.
--
-- WHY IT IS WRITTEN THIS WAY
--   The function body is full of Persian UI strings. Retyping it by hand risks a
--   silent near-miss (a changed ZWNJ, a normalised character). Instead we take
--   the live definition and rewrite ONLY the offending token, so every other
--   byte of the body is preserved exactly. Same technique as migration 202.
--
--   `role::text = 'accountant'` is used rather than `role = 'accountant'`: it is
--   explicit about the intent and matches how has_role()/has_any_role() already
--   compare this column everywhere else in the schema.
--
-- SCOPE
--   This was the only live instance of the pattern in the database. A scan of
--   pg_proc found one other candidate, recompute_employee_scores_on_receipt_link(),
--   but that one is already fixed - it uses the safe has_role(uuid, app_role)
--   overload and only mentions the old bug in a comment. No RLS policy has the
--   pattern.
--
-- NOTE
--   Existing prices are NOT recomputed here. After deploying, use the
--   "calculate and publish prices" action (per product, or the batch publish
--   page) to refresh the 315 products whose prices are stale.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_def     text;
  v_fixed   text;
  v_oid     oid;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'notify_accountants_on_sale_price_change'
    AND p.pronargs = 0;

  IF v_oid IS NULL THEN
    RAISE EXCEPTION
      'notify_accountants_on_sale_price_change() not found - refusing to guess.';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  -- Already fixed (re-run): nothing to do.
  IF position('''accountant''::app_role' IN v_def) = 0 THEN
    RAISE NOTICE '215: trigger function already free of the app_role comparison - skipping.';
    RETURN;
  END IF;

  v_fixed := replace(
    v_def,
    'ur.role = ''accountant''::app_role',
    'ur.role::text = ''accountant'''
  );

  -- Guard against a replace() that silently matched nothing (e.g. whitespace
  -- drift). If the text did not change, fail loudly rather than ship a no-op.
  IF v_fixed = v_def THEN
    RAISE EXCEPTION
      '215: found ''accountant''::app_role but the expected expression did not match - aborting.';
  END IF;

  EXECUTE v_fixed;
END $$;

-- Post-condition: the comparison must be gone.
DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'notify_accountants_on_sale_price_change'
    AND p.pronargs = 0;

  IF position('''accountant''::app_role' IN v_def) > 0 THEN
    RAISE EXCEPTION '215: post-check failed - app_role comparison still present.';
  END IF;

  IF position('ur.role::text = ''accountant''' IN v_def) = 0 THEN
    RAISE EXCEPTION '215: post-check failed - corrected comparison not found.';
  END IF;

  RAISE NOTICE '215: OK - notify_accountants_on_sale_price_change() now compares role::text.';
END $$;

COMMIT;
