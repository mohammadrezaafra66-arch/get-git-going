-- 373-down.sql — reverse migration 373 (close the anon default-privilege tap on TABLES and SEQUENCES).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction
-- (Gate A phase-2 M7, the rule from migration 350 onward). An embedded COMMIT commits the *outer*
-- transaction, which is how an earlier phase produced a rollback proof that could not have happened.
--
-- WHAT 373 DID
--
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
--
-- It changed NO existing object. It changed what every FUTURE table, view and sequence created by
-- supabase_admin in `public` is granted.
--
-- WHY. Measured 2026-08-22 inside BEGIN … ROLLBACK, before the change: a freshly created view came
-- out with `anon=arwdDxt/supabase_admin` in its ACL and `has_table_privilege('anon', …, 'SELECT')`
-- was `t`; a freshly created sequence came out with `anon=rwU/supabase_admin` and
-- `has_sequence_privilege('anon', …, 'USAGE')` was `t`. That is the tap OG-25 is about: G-1 was not
-- a mistake on eight views, it was the schema default, and those eight were merely where someone
-- looked.
--
-- WHAT THIS FILE RESTORES
--
-- The two `anon` entries exactly as pg_default_acl recorded them on 2026-08-22 before 373. These
-- privilege sets were NOT assumed from "the Supabase default" — they were read from the live
-- catalogue (og25-anon-default-privileges-PROGRESS.md §0.1):
--
--   public | r | {postgres=arwdDxt/…, anon=arwdDxt/…, authenticated=arwdDxt/…, service_role=arwdDxt/…}
--   public | S | {postgres=rwU/…,     anon=rwU/…,     authenticated=rwU/…,     service_role=rwU/…}
--
--   arwdDxt = INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER  -> GRANT ALL ON TABLES
--   rwU     = SELECT, UPDATE, USAGE                                          -> GRANT ALL ON SEQUENCES
--
-- The other six pg_default_acl rows (five pgsodium* rows and the `public | f` FUNCTIONS row) are
-- deliberately absent from both 373 and this file. 373 never touched them, so restoring them would
-- not be a rollback — it would be a change.
--
-- CONSEQUENCE OF RUNNING THIS. Every table, view and sequence created afterwards is once again
-- granted to `anon` automatically, and the G-1 class of defect becomes reachable again on the next
-- new object. Run it only as a deliberate rollback.
--
-- ORDER. 373-down is independent of 374-down; either may be run without the other. If you are
-- rolling back the whole mission, order does not matter — 374 grants nothing that 373 depends on.

SET client_encoding = 'UTF8';

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon;
