-- ROLLBACK for migration 395 (OG-62 — the anon-reachable definer leaks).
--
-- Written BEFORE the forward migration (A5.28) and built from the LIVE captured ACLs of the
-- 28 functions on the `afrakala` database on 2026-08-26.
--
-- **Applying this file RE-OPENS OG-62.** `get_product_sale_price` will again return a real
-- sale price to an anonymous caller, and the staff-leaderboard, workflow-config and
-- schema-metadata functions will again be readable without a session. That is what a
-- rollback is for, but it should be deliberate, so the assertion at the end says so with a
-- WARNING rather than staying quiet.
--
-- Both grants are restored for each function, in the same order the forward file revoked
-- them: `anon` AND `PUBLIC`. Restoring only `anon` would leave the captured state
-- unreproduced, because PostgreSQL's default PUBLIC grant is part of what was removed.
--
-- Verification target — md5 over all 28 of the ACL as a SET of
-- (signature, grantee, privilege, grantor) tuples, sorted, captured before the change:
--     fafe7d142481125fb1c158ecd3f01f8c
--
-- **It is compared as a SET, deliberately.** A REVOKE followed by a GRANT restores the same
-- privileges but appends the re-granted entries at the END of the aclitem array, so the raw
-- `proacl::text` comes back in a different ORDER and an md5 over that text reports a false
-- mismatch. Measured here, on `get_product_sale_price`:
--   before {=X,supabase_admin=X,anon=X,authenticated=X,service_role=X,postgres=X}
--   after  {supabase_admin=X,authenticated=X,service_role=X,postgres=X,anon=X,=X}
-- Same six entries, different order. Array order is a storage detail; the privilege set is
-- the invariant that matters, and the first draft of this file got that wrong.
--
-- How to run:
--   docker cp docs/verification/395-down.sql afrakala-lan-db:/tmp/395-down.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f /tmp/395-down.sql
--   docker restart afrakala-lan-rest

SET client_encoding='UTF8';

GRANT EXECUTE ON FUNCTION public.get_current_league(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_current_league(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_employee_rank(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_employee_rank(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_all_time(text,text,text,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_all_time(text,text,text,integer,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_daily(text,text,text,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_daily(text,text,text,integer,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_monthly(text,text,text,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_monthly(text,text,text,integer,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(text,text,text,text,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(text,text,text,text,integer,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_weekly(text,text,text,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_weekly(text,text,text,integer,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_league_leaderboard(league_tier,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_league_leaderboard(league_tier,integer,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_numeric_setting(text,numeric) TO anon;
GRANT EXECUTE ON FUNCTION public.get_numeric_setting(text,numeric) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_observatory_pdf_hints_for_products(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_observatory_pdf_hints_for_products(uuid[]) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_observatory_snippets_for_products(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_observatory_snippets_for_products(uuid[]) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_price_bounds(uuid,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_product_price_bounds(uuid,uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_sale_price(uuid,uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_product_sale_price(uuid,uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_stats(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_product_stats(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_timeline(uuid,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_product_timeline(uuid,integer,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rank_neighbors(uuid,text,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_rank_neighbors(uuid,text,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workflow_settings() TO anon;
GRANT EXECUTE ON FUNCTION public.get_workflow_settings() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workflow_setting(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_workflow_setting(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_trusted_credit_customers(text,text,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,boolean,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.list_trusted_credit_customers(text,text,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,boolean,integer,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public._par_latest_usd_rate() TO anon;
GRANT EXECUTE ON FUNCTION public._par_latest_usd_rate() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.person_fk_registry_report() TO anon;
GRANT EXECUTE ON FUNCTION public.person_fk_registry_report() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.person_merge_registry_keys() TO anon;
GRANT EXECUTE ON FUNCTION public.person_merge_registry_keys() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.polymorphic_ref_orphan_report() TO anon;
-- public.polymorphic_ref_orphan_report() had NO PUBLIC grant before 395; deliberately not re-granted.
GRANT EXECUTE ON FUNCTION public.product_videos_waiting() TO anon;
-- public.product_videos_waiting() had NO PUBLIC grant before 395; deliberately not re-granted.
GRANT EXECUTE ON FUNCTION public._promo_policy_for(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public._promo_policy_for(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_market_product_match(market_match_source,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.resolve_market_product_match(market_match_source,text,text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_messenger_messages_semantic(uuid,vector,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_messenger_messages_semantic(uuid,vector,integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_journal_entry_balance(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_journal_entry_balance(uuid) TO PUBLIC;

DO $$
DECLARE
  names text[] := ARRAY[
    '_par_latest_usd_rate',
    '_promo_policy_for',
    'get_current_league',
    'get_employee_rank',
    'get_leaderboard',
    'get_leaderboard_all_time',
    'get_leaderboard_daily',
    'get_leaderboard_monthly',
    'get_leaderboard_weekly',
    'get_league_leaderboard',
    'get_numeric_setting',
    'get_observatory_pdf_hints_for_products',
    'get_observatory_snippets_for_products',
    'get_product_price_bounds',
    'get_product_sale_price',
    'get_product_stats',
    'get_product_timeline',
    'get_rank_neighbors',
    'get_workflow_setting',
    'get_workflow_settings',
    'list_trusted_credit_customers',
    'person_fk_registry_report',
    'person_merge_registry_keys',
    'polymorphic_ref_orphan_report',
    'product_videos_waiting',
    'resolve_market_product_match',
    'search_messenger_messages_semantic',
    'validate_journal_entry_balance'
  ];
  got text;
BEGIN
  SELECT md5(string_agg(t, E'\n' ORDER BY t)) INTO got FROM (
    SELECT p.oid::regprocedure::text || '|' ||
           CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || '|' ||
           a.privilege_type || '|' || a.grantor::regrole::text AS t
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace,
         aclexplode(p.proacl) a
    WHERE ns.nspname = 'public' AND p.proname = ANY(names)
  ) s;

  IF got IS DISTINCT FROM 'fafe7d142481125fb1c158ecd3f01f8c' THEN
    RAISE EXCEPTION '395-down: the ACL set was NOT restored to the captured state (got %, expected fafe7d142481125fb1c158ecd3f01f8c)', got;
  END IF;

  RAISE WARNING '395-down applied: OG-62 IS RE-OPENED. get_product_sale_price again returns a real sale price to an anonymous caller, and the staff/leaderboard, workflow-config and schema-metadata functions are anon-readable again. The ACL set matches the pre-395 capture byte for byte.';
END $$;
