SET client_encoding='UTF8';

-- ============================================================================================
-- 525 - close anon on the five DEFINER views that bypass RLS and expose financial data.
--
-- ASCII-ONLY BY DESIGN, as 477, 523 and 524 are.
--
-- ============================================================================================
-- WHAT PRODUCTION FOUND, 2026-09-12, Phase 5 block 67
-- ============================================================================================
--
-- The og103-style census listed five views still readable by anon:
--
--     product_computed_prices_public
--     publish_recipients_view
--     v_customer_credit_exposure
--     v_dynamic_customer_capital_balances
--     v_dynamic_salesperson_capital_balances
--
-- All five are DEFINER views - they carry no `security_invoker` reloption, so they execute as
-- their owner and the row level security on their base tables DOES NOT APPLY to the caller.
-- An anon SELECT therefore returns rows, not an empty set. That is the whole difference
-- between these and the seven INVOKER views anon can also reach, which are left alone here.
--
-- ============================================================================================
-- HOW THEY CAME TO BE OPEN - measured on the production dump, not inferred
-- ============================================================================================
--
-- Migration 370 (20260822143000) revoked anon on six views, four of them from this list.
-- Migration 386 (20260824210000) then re-created eight views with CREATE OR REPLACE VIEW,
-- including those four. 386 states in its own header that `relacl` is preserved by CREATE OR
-- REPLACE and that it therefore "contains no GRANT and no REVOKE".
--
-- The catalogue disagrees. Read from the production dump:
--
--   product_computed_prices_public          ... anon=r/supabase_admin
--   publish_recipients_view                 ... anon=arwdDxt/supabase_admin
--   v_dynamic_customer_capital_balances     ... anon=arwdDxt/supabase_admin
--   v_dynamic_salesperson_capital_balances  ... anon=arwdDxt/supabase_admin
--   v_promotion_suggestions                 ... no anon entry at all
--   vw_account_balances                     ... no anon entry at all
--
-- The grantor on every one of those entries is `supabase_admin`, which is the signature of
-- production's `pg_default_acl` - nine entries that granted anon `arwdDxt` on TABLES, and a
-- view is a table for that purpose. So the grant did not come from any GRANT statement in any
-- migration; it was re-applied automatically when the relation was created. That is the same
-- mechanism migration 471 traced for `ai_get_provider_key` and the same one that made 507 fail.
--
-- Note what three of those entries say: `arwdDxt` is not read-only. anon holds INSERT, UPDATE
-- and DELETE on `publish_recipients_view` and both capital-balance views, not merely SELECT.
--
-- The two that stayed closed are the two the owner revoked by hand on 2026-09-07. Nothing in
-- the migration history closed them either.
--
-- Block 3 of this run closed the default ACL, but a default privilege only governs objects
-- created AFTER it changes. It cannot reach a relation that already exists. These five already
-- existed. They have to be revoked explicitly, and that is all this migration does.
--
-- 523 and 524 did not catch them because 477 - the list 523 is derived from - targets
-- `relkind = 'r'` only. Views were never in its scope. This is the same blind spot og103 has
-- carried since day one.
--
-- ============================================================================================
-- ORDERING - this must be the last word
-- ============================================================================================
--
-- The latest migration touching any of the five is 408 (20260827100000), which creates
-- `v_customer_credit_exposure`. 386 (20260824210000) re-creates the other four. The newest
-- migration on disk is 524 (20260912143000). This file is 20260912150000, so it sorts after
-- every one of them and nothing in the repository can re-open these views behind it.
--
-- That ordering is a property of the filenames, not a guarantee about the future: any later
-- migration that DROPs and re-CREATEs one of these views will hand it a fresh ACL. With the
-- default ACL now closed the fresh ACL no longer includes anon, which is precisely why Block 3
-- had to happen before this and not after.
--
-- ============================================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================================================
--
-- It does NOT set `security_invoker = true` on these views. That would make RLS apply to the
-- caller and would change what SIGNED-IN users see, not merely what anon sees - migration 386
-- records that question as OG-28 and deliberately leaves it open. Revoking anon removes the
-- exposure without touching a single authenticated user's result set. Turning on
-- security_invoker is a separate decision with a separate blast radius.
--
-- It does NOT touch the seven INVOKER views anon can read (academy_quiz_questions_public,
-- effective_currencies_view, employee_monthly_hours, v_latest_active_purchase_prices,
-- v_league_tiers_public, v_pricing_recompute_queue_summary, vw_purchase_float). Those execute
-- as the caller, so RLS applies and anon sees what RLS lets it see. They are out of scope and
-- the verification below asserts they are unchanged.
--
-- It is driven by the catalogue, not by a static list of names that must exist: each view is
-- resolved with to_regclass and skipped when absent. A static list is exactly what made 477
-- abort on production at order 39.
--
-- ONE THING TO WATCH IN THE SMOKE TEST: `product_computed_prices_public` has "public" in its
-- name. Migration 370 already revoked anon on it once, so the project's settled position is
-- that an anonymous visitor should not read it, and decision D-24 keeps the public sale-list
-- page closed to anonymous visitors. If some anonymous page does go blank after this, that is
-- the one to look at first - and the fix would be a named, column-scoped grant, never a return
-- to `arwdDxt`.
-- ============================================================================================

DO $close$
DECLARE
  v_names text[] := ARRAY[
    'product_computed_prices_public',
    'publish_recipients_view',
    'v_customer_credit_exposure',
    'v_dynamic_customer_capital_balances',
    'v_dynamic_salesperson_capital_balances'
  ];
  v_name    text;
  v_oid     oid;
  v_before  text;
  v_present int := 0;
  v_absent  int := 0;
  v_revoked int := 0;
BEGIN
  FOREACH v_name IN ARRAY v_names LOOP
    v_oid := to_regclass('public.' || quote_ident(v_name));

    IF v_oid IS NULL THEN
      v_absent := v_absent + 1;
      RAISE NOTICE '525: public.% is absent - skipped (this is not an error)', v_name;
      CONTINUE;
    END IF;

    v_present := v_present + 1;

    SELECT string_agg(p, ',') INTO v_before
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
     WHERE has_table_privilege('anon', v_oid, p);

    IF v_before IS NULL THEN
      RAISE NOTICE '525: public.% already grants anon nothing - no change', v_name;
    ELSE
      RAISE NOTICE '525: public.% - anon held %', v_name, v_before;
      v_revoked := v_revoked + 1;
    END IF;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', v_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', v_name);
  END LOOP;

  RAISE NOTICE '525: % present, % absent, % had an anon grant to remove',
    v_present, v_absent, v_revoked;
END
$close$;

-- Verification in the SAME transaction, re-read from the catalogue. PostgreSQL prints REVOKE
-- even when there was nothing to revoke, so the statement tag proves nothing; this read does.
DO $verify$
DECLARE
  v_targets text[] := ARRAY[
    'product_computed_prices_public',
    'publish_recipients_view',
    'v_customer_credit_exposure',
    'v_dynamic_customer_capital_balances',
    'v_dynamic_salesperson_capital_balances'
  ];
  -- the seven INVOKER views anon may still read; asserted UNCHANGED, not closed
  v_keep text[] := ARRAY[
    'academy_quiz_questions_public',
    'effective_currencies_view',
    'employee_monthly_hours',
    'v_latest_active_purchase_prices',
    'v_league_tiers_public',
    'v_pricing_recompute_queue_summary',
    'vw_purchase_float'
  ];
  v_name text;
  v_oid  oid;
  v_left text;
  v_bad  text := NULL;
  v_lost text := NULL;
BEGIN
  FOREACH v_name IN ARRAY v_targets LOOP
    v_oid := to_regclass('public.' || quote_ident(v_name));
    CONTINUE WHEN v_oid IS NULL;

    SELECT string_agg(p, ',') INTO v_left
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
     WHERE has_table_privilege('anon', v_oid, p);

    IF v_left IS NOT NULL THEN
      v_bad := coalesce(v_bad || '; ', '') || v_name || ' still grants anon ' || v_left;
    END IF;
  END LOOP;

  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '525 VERIFY: %', v_bad;
  END IF;

  -- The seven INVOKER views must be exactly as they were. If this migration narrowed one of
  -- them it overreached, and that is a failure even though it errs toward closed.
  FOREACH v_name IN ARRAY v_keep LOOP
    v_oid := to_regclass('public.' || quote_ident(v_name));
    CONTINUE WHEN v_oid IS NULL;
    IF NOT has_table_privilege('anon', v_oid, 'SELECT') THEN
      v_lost := coalesce(v_lost || ', ', '') || v_name;
    END IF;
  END LOOP;

  IF v_lost IS NOT NULL THEN
    RAISE EXCEPTION
      '525 VERIFY: these INVOKER views lost anon SELECT and are out of scope for 525: %', v_lost;
  END IF;

  RAISE NOTICE '525 VERIFY: the five DEFINER views grant anon nothing; the seven INVOKER views are unchanged';
END
$verify$;
