SET client_encoding = 'UTF8';

-- 390 — OG-52. Close the category margin to `anon`, and close the SECURITY DEFINER path that
-- hands `anon` a real computed sale price.
--
-- WHAT WAS MEASURED BEFORE THIS FILE WAS WRITTEN
--
--   `anon` held `arwdDxt` on public.categories -- the OG-30 blanket grant -- with ZERO column
--   ACLs, so it read all 11 columns including `base_margin_percent`, which holds 15.00 on all
--   12 rows. That is the house margin: a single number that describes the business, and
--   commercially more sensitive than the sku and staff uuids migrations 388 and 389 closed.
--
--   THE SWEEP FOUND SOMETHING LARGER, AND IT IS THE REASON THIS FILE HAS A SECOND HALF.
--   `calculate_adjusted_price(uuid)` is SECURITY DEFINER and `anon`-executable. It reads
--   `product_computed_prices` -- which `anon` cannot read, 42501, that denial being what
--   OG-29 and `PUBLISH_PUBLIC_PRICES = false` rest on -- multiplies by the category margin,
--   and returns the result. Measured live as `anon` inside BEGIN/ROLLBACK:
--
--       anon direct read of product_computed_prices : DENIED, 42501
--       anon calling calculate_adjusted_price(...)  : 38,985,000
--       the true stored price for that product      : 33,900,000
--       ratio                                        : exactly 1.15
--
--   So the margin was not merely readable as a column; it was recoverable from the function's
--   output, and the real price came out with it. A column REVOKE alone does not touch this --
--   a definer function executes as its owner and walks through column grants and RLS alike.
--   This is the same shape migration 389 had to close for `products.sku`, found this time by
--   sweeping for it rather than by being surprised by it.
--
--   The function writes NOTHING (`prosrc` contains no INSERT/UPDATE/DELETE), so it is
--   mislabelled VOLATILE. An earlier mission declined to invoke it on the assumption that
--   VOLATILE meant it wrote; that assumption was wrong and is corrected here.
--
-- WHAT IS DELIBERATELY NOT CLOSED
--
--   The 12 other `anon`-executable definer functions that read `categories` all build their
--   category payload with an explicit `jsonb_build_object('id', c.id, 'name', c.name)` and
--   never `to_jsonb(c)`, so none of them carries the margin out. Checked per function, not
--   by sampling. Check F below pins that property so a future `to_jsonb(c)` fails this gate.
--
-- ORDER MATTERS AND IT IS THE WHOLE MIGRATION
--
--   `REVOKE SELECT ON <table>` also destroys every column ACL on that table. The REVOKE must
--   come FIRST and the GRANT second, or the column grants are silently erased and the file
--   ships as a no-op. Migration 388's first draft made exactly that mistake.
--
--   `REVOKE ... FROM anon` alone achieves nothing on a function: PostgreSQL grants EXECUTE to
--   PUBLIC by default and this function's proacl carried a leading `=X`. Both revokes are
--   required and neither is redundant.
--
-- WHAT `anon` STILL NEEDS. `src/lib/public/get-public-sale-list.ts:118` reads
-- `categories.select("id, name").in("id", ...)` with no session -- that is the only
-- unauthenticated consumer of this table in the whole of src/. Six columns are granted rather
-- than those two: `id, name, slug, parent_id, description, is_active` are catalogue-shaped and
-- the rows are already public (`categories_public_read` is `true` for anon), while
-- `base_margin_percent`, `naming_template`, `primary_spec_label`, `created_at` and `updated_at`
-- are internal. Only `id` and `name` are consumed today; that is recorded so a later mission
-- can narrow to two without re-measuring.
--
-- Rollback: docs/verification/390-down.sql, dry-run proved against this exact state BEFORE
-- this file was applied -- forward, then rollback, then a field-by-field comparison with the
-- captured relacl and proacl.

REVOKE SELECT ON public.categories FROM anon;

GRANT SELECT (
  id,
  name,
  slug,
  parent_id,
  description,
  is_active
) ON public.categories TO anon;

REVOKE EXECUTE ON FUNCTION public.calculate_adjusted_price(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_adjusted_price(uuid) FROM PUBLIC;

DO $chk$
DECLARE
  v_public  CONSTANT text[] := ARRAY['id','name','slug','parent_id','description','is_active'];
  v_live    text[];
  v_anon    text[];
  v_auth    text[];
  v_n       integer;
  v_rows    bigint;
BEGIN
  -- ---------------------------------------------------------------- A0. VACUITY GUARDS
  -- Every check below is a comparison, and a comparison against an empty set passes for the
  -- wrong reason. Migration 383 carries a guard of this shape because 382's did not, and
  -- 389's had to be moved to the front because has_function_privilege RAISES on a name that
  -- does not exist rather than returning false -- so the existence test comes first here.
  IF to_regprocedure('public.calculate_adjusted_price(uuid)') IS NULL THEN
    RAISE EXCEPTION '390 FAILED A0: calculate_adjusted_price(uuid) does not exist. Every EXECUTE check below would raise rather than fail, so this gate cannot speak.';
  END IF;

  SELECT array_agg(a.attname ORDER BY a.attnum) INTO v_live
  FROM pg_attribute a
  WHERE a.attrelid = 'public.categories'::regclass AND a.attnum > 0 AND NOT a.attisdropped;

  IF v_live IS NULL OR array_length(v_live, 1) < array_length(v_public, 1) THEN
    RAISE EXCEPTION '390 FAILED A0: public.categories has % live columns, fewer than the % this gate grants. The table was dropped or gutted; a set-equality check would pass vacuously.',
      coalesce(array_length(v_live,1), 0), array_length(v_public,1);
  END IF;

  -- --------------------------------------------------- A. SET EQUALITY, NOT TWO NAME LISTS
  -- Asserted over every LIVE column rather than against a hardcoded list of what to withhold.
  -- A column added to this table tomorrow and granted to anon fails this check; a gate written
  -- as "these five are withheld" would not see it. Migration 389's correction, applied from
  -- the start instead of after a review defeated it.
  SELECT array_agg(a.attname ORDER BY a.attname) INTO v_anon
  FROM pg_attribute a
  WHERE a.attrelid = 'public.categories'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    AND has_column_privilege('anon', 'public.categories', a.attname, 'SELECT');

  IF v_anon IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(v_public) x) THEN
    RAISE EXCEPTION '390 FAILED A: the set of category columns anon can read is %, not the intended %. Checked by effect per column over every live column, so this covers a column added after this migration was written.',
      coalesce(v_anon::text, '{}'), (SELECT array_agg(x ORDER BY x) FROM unnest(v_public) x)::text;
  END IF;

  -- ------------------------------------------------------------- B. NO TABLE-LEVEL SELECT
  -- Without this, select=* still works and every future column is granted automatically. The
  -- column grants above are additive and can never withhold anything on their own -- that is
  -- the factual error migration 380's header carries, corrected in the ledger.
  IF has_table_privilege('anon', 'public.categories', 'SELECT') THEN
    RAISE EXCEPTION '390 FAILED B: anon still holds TABLE-level SELECT on public.categories, so select=* succeeds and every column added later is granted by default. The column grants are additive and cannot withhold on their own.';
  END IF;

  -- ------------------------------- C. THE OTHER DIRECTION: authenticated must NOT be narrowed
  -- The failure this catches is the one that voided migration 386's gate: a one-sided check
  -- that tests only the direction which OPENS the surface passes happily while the change has
  -- broken every signed-in user. anon losing a column and authenticated losing it too look
  -- identical to check A and are completely different outcomes.
  SELECT array_agg(a.attname ORDER BY a.attname) INTO v_auth
  FROM pg_attribute a
  WHERE a.attrelid = 'public.categories'::regclass AND a.attnum > 0 AND NOT a.attisdropped
    AND has_column_privilege('authenticated', 'public.categories', a.attname, 'SELECT');

  IF coalesce(array_length(v_auth,1),0) <> array_length(v_live,1) THEN
    RAISE EXCEPTION '390 FAILED C: authenticated reads % of the % live category columns. This migration narrows anon only; narrowing authenticated breaks every signed-in reader and is not what OG-52 asked for.',
      coalesce(array_length(v_auth,1),0), array_length(v_live,1);
  END IF;

  -- ------------------- D. THE DEFINER PATH, BOTH REVOKES, AND THE CALLER THAT MUST SURVIVE
  IF has_function_privilege('anon', 'public.calculate_adjusted_price(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '390 FAILED D: anon still holds EXECUTE on calculate_adjusted_price. It is SECURITY DEFINER and returns a real computed sale price derived from product_computed_prices, which anon cannot read directly -- so the column revoke above is decorative while this stands.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = 'public.calculate_adjusted_price(uuid)'::regprocedure)) a
    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION '390 FAILED D: PUBLIC still holds EXECUTE on calculate_adjusted_price. PostgreSQL grants functions to PUBLIC by default, so revoking from anon alone leaves the function reachable by every role including anon. Both revokes are required and neither is redundant.';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.calculate_adjusted_price(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '390 FAILED D: authenticated LOST EXECUTE on calculate_adjusted_price. It has one real caller in src/routes -- closing a door is not the same as closing a feature, and this gate refuses to confuse them.';
  END IF;

  -- ------------------------------------ E. THE ROW LAYER MUST BE UNCHANGED, MEASURED NOT READ
  -- The other half of "too closed": this migration narrows COLUMNS. If it also emptied the
  -- table for anon, checks A-D would all still pass. Asserted by actually reading as anon
  -- rather than by inspecting pg_policy, because a policy can exist and still return nothing.
  -- Deliberately NOT pinned to 12: that is live business data, and migration 381's pinned
  -- census is exactly why 382 had to retire it. The assertion is "more than zero".
  SET LOCAL ROLE anon;
  EXECUTE 'SELECT count(*) FROM public.categories' INTO v_rows;
  RESET ROLE;

  IF v_rows IS NULL OR v_rows = 0 THEN
    RAISE EXCEPTION '390 FAILED E: anon now reads ZERO rows from public.categories. This migration narrows columns and must leave the row layer alone; the public sale-list page reads this table with no session.';
  END IF;

  -- --------------------------- F. NO OTHER DEFINER DOOR CARRIES THE MARGIN OUT
  -- The 12 other anon-executable definer functions that read categories all build their
  -- payload with an explicit jsonb_build_object(id, name), checked per function rather than
  -- sampled. This pins that property: a future to_jsonb(c), or any new definer function that
  -- names the column, fails here instead of in production.
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND (p.prosrc ILIKE '%base_margin_percent%' OR p.prosrc ~* 'to_jsonb[[:space:]]*\([[:space:]]*c[0-9]?[[:space:]]*\)');

  IF v_n > 0 THEN
    RAISE EXCEPTION '390 FAILED F: % anon-executable SECURITY DEFINER function(s) still name base_margin_percent or build a category payload with to_jsonb(c). A definer function ignores the column grants above entirely -- that is how migration 388 was defeated and why 389 had to be written.', v_n;
  END IF;

  RAISE NOTICE '390 OK: anon reads exactly the % catalogue columns of public.categories and none of the % internal ones, asserted as SET EQUALITY over every live column by effect, so a column added tomorrow and granted to anon fails this gate; anon holds no TABLE-level SELECT, so select=* fails; authenticated still reads all % columns and the row layer is untouched (anon still sees % rows); and the SECURITY DEFINER price path is closed to anon AND to PUBLIC while authenticated keeps it, so its one real caller still works. No other anon-executable definer function carries the margin out.',
    array_length(v_public,1), array_length(v_live,1) - array_length(v_public,1), array_length(v_live,1), v_rows;
END
$chk$;
