-- 390-down.sql — rollback for migration 390. REVERSES TWO REAL PRIVILEGE CHANGES.
--
-- Migration 390 does two things, and this file undoes both. Running it RE-OPENS both holes:
-- the category margin becomes readable by anon again, and anon can once more obtain a real
-- computed sale price for any product through calculate_adjusted_price. Do not run it to
-- "tidy up" — run it only to restore the exact state captured live on 2026-08-25 BEFORE the
-- migration was written:
--
--   categories relacl : {postgres=arwdDxt/postgres,anon=arwdDxt/postgres,
--                        authenticated=arwdDxt/postgres,service_role=arwdDxt/postgres}
--   categories attacl : 0 columns carry a column ACL
--   calculate_adjusted_price(uuid) proacl :
--                       {=X/supabase_admin,postgres=X/supabase_admin,supabase_admin=X/...,
--                        anon=X/...,authenticated=X/...,service_role=X/...}
--
-- ORDER MATTERS, AND IT IS THE OPPOSITE OF THE FORWARD FILE'S.
--
-- The GRANT comes first. REVOKE SELECT ON <table> also destroys every column ACL on that
-- table, so if the column REVOKE ran first there would be an instant with no SELECT at all,
-- and src/lib/public/get-public-sale-list.ts -- which reads categories as anon -- would
-- degrade in that window. Granting first means the table privilege is never absent.
--
-- The second statement is then needed to clear the six column ACLs: restoring only the
-- table-level grant would leave `attacl` populated where it was empty before, so the
-- catalogue would not match its captured state even though every privilege check answered
-- the same. This is the same asymmetry 388-down.sql documents.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not touch INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER on categories, because migration 390 never removed them. `anon` holds
-- `arwdDxt` on this table -- the OG-30 blanket grant -- and narrowing that is OG-30's
-- decision, not this one's. A rollback that gave back more than the migration took away is
-- the asymmetric-rollback defect migrations 374, 376 and 377 are documented for.
--
-- Per the programme's rollback rule this file carries statements only -- no BEGIN, no COMMIT,
-- no ROLLBACK. The caller owns the transaction.

SET client_encoding = 'UTF8';

GRANT SELECT ON public.categories TO anon;

REVOKE SELECT (
  id,
  name,
  slug,
  parent_id,
  description,
  is_active
) ON public.categories FROM anon;

GRANT EXECUTE ON FUNCTION public.calculate_adjusted_price(uuid) TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.calculate_adjusted_price(uuid) TO anon;
