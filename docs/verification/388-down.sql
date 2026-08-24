-- 388-down.sql — rollback for migration 388. REVERSES A REAL PRIVILEGE CHANGE.
--
-- Migration 388 narrows `anon`'s SELECT on `public.products` from the whole table to nine named
-- columns. This file puts it back to exactly the state captured live on 2026-08-24 BEFORE the
-- migration was written:
--
--   relacl : {postgres=arwdDxt/postgres,anon=arwdDxt/postgres,authenticated=arwdDxt/postgres,
--             service_role=arwdDxt/postgres}
--   attacl : 0 columns carry a column ACL
--   anon table-level privileges: SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,TRUNCATE
--
-- TWO STATEMENTS, AND BOTH ARE NEEDED. Restoring only the table-level grant would leave the
-- nine column ACLs behind: `attacl` would stay populated where it was empty before, so the
-- catalogue would not match its captured state even though every privilege check would answer
-- the same. The column REVOKE clears them.
--
-- ORDER MATTERS. The GRANT comes first. If the REVOKE ran first there would be an instant with
-- no SELECT at all, and `/api/public/products` — which runs as `anon`, verified — would answer
-- 500 to any request landing in that window.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO. It does not restore INSERT/UPDATE/DELETE/TRUNCATE/
-- REFERENCES/TRIGGER, because migration 388 never removed them. `anon` holds `arwdDxt` on this
-- table — the OG-30 blanket grant — and narrowing that is OG-30's decision, not this one's. A
-- rollback that granted more than the migration took away would be the asymmetric-rollback
-- defect migrations 374, 376 and 377 are documented for.
--
-- Per the programme's rollback rule this file carries statements only — no BEGIN, no COMMIT, no
-- ROLLBACK. The caller owns the transaction. `docs/verification/rollback-dryrun.sql` is the
-- caller used to prove it, run against this file BEFORE migration 388 was applied.

SET client_encoding = 'UTF8';

GRANT SELECT ON public.products TO anon;

REVOKE SELECT (
  id,
  name,
  model,
  capacity,
  stock_status,
  is_active,
  brand_id,
  category_id,
  description
) ON public.products FROM anon;
