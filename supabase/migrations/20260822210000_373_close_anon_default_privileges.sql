-- 373 — close the schema-wide `ALTER DEFAULT PRIVILEGES … TO anon` tap on TABLES and SEQUENCES (OG-25).
--
-- THE DEFECT. `pg_default_acl` carries, for role `supabase_admin` in schema `public`:
--
--   objtype r (tables and views) : {postgres=arwdDxt/…, anon=arwdDxt/…, authenticated=arwdDxt/…, service_role=arwdDxt/…}
--   objtype S (sequences)        : {postgres=rwU/…,     anon=rwU/…,     authenticated=rwU/…,     service_role=rwU/…}
--
-- So every table, view and sequence created by `supabase_admin` in `public` is granted to `anon`
-- automatically, with no one deciding it. Measured live on 2026-08-22 inside BEGIN … ROLLBACK:
--
--   CREATE VIEW public._og25_probe AS SELECT 1 AS x;
--     relacl                                        -> {… anon=arwdDxt/supabase_admin …}
--     has_table_privilege('anon', …, 'SELECT')      -> t
--   CREATE SEQUENCE public._og25_probe_seq;
--     relacl                                        -> {… anon=rwU/supabase_admin …}
--     has_sequence_privilege('anon', …, 'USAGE')    -> t
--
-- This is the root of G-1. That mission closed an unauthenticated read on eight views and correctly
-- refused to call it a fix: the eight were not a mistake, they were the schema default, and they were
-- merely where someone happened to look. Its independent reviewer proved the point by creating a
-- fresh view and reading a bank balance through it as `anon` — with G-1 fully remediated.
--
-- WHAT THIS MIGRATION DOES
--
--   Revokes the `anon` default privilege on TABLES and on SEQUENCES.
--
-- WHAT IT DELIBERATELY DOES NOT DO, BY OWNER DECISION (2026-08-22)
--
--   * It does NOT touch the FUNCTIONS default privilege (`public | f | {… anon=X/… …}`). `anon=X`
--     on functions is load-bearing for `authenticateBot` and the auth path; narrowing it needs its
--     own measurement and its own mission. There is deliberately no `ON FUNCTIONS` line below.
--   * It does NOT revoke anything from any existing object. 211 objects in `public` currently hold
--     an `anon` grant (204 tables + 7 views). Whether to strip them is a separate decision the owner
--     has not taken; `docs/research/anon-grant-audit.md` gives them the numbers to size it.
--   * It does NOT touch the five `pgsodium` / `pgsodium_masks` rows in `pg_default_acl`, or the
--     `postgres` / `authenticated` / `service_role` entries in the two rows it does change.
--
-- SCOPE CHECK. This migration touches ZERO existing objects. If applying it changes any existing
-- object's ACL, something is wrong with this understanding — 375's gate re-checks the census.
--
-- ROLLBACK: docs/verification/373-down.sql (written and dry-run proved before this file existed).
-- Object owner: supabase_admin.

SET client_encoding = 'UTF8';

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
