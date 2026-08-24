-- The catalogue digest this programme regresses against. READ-ONLY.
--
-- WHY THIS FILE EXISTS. Five progress documents record the VALUE
-- `a51ee08e55ff48453d7a2925f1c5d098` and not one of them recorded the QUERY. M6's independent
-- reviewer tried to reproduce it from the nearest formula written down anywhere in the repo
-- (`docs/execution/og25-anon-default-privileges-PROGRESS.md`, which filters
-- `relkind IN ('r','v','S')` and joins with `=` and `|`) and got
-- `5e31cb642a399d0370f56da643424a2d`; four further variants also missed. They correctly refused
-- to mark the check passed and reported it as not independently verified.
--
-- A baseline nobody else can recompute is not a baseline — it is a number one agent can assert
-- and no one can contradict. This file is the definition.
--
-- SCOPE, and why each choice matters:
--   * ALL relkinds in `public`, not just r/v/S. `ALTER DEFAULT PRIVILEGES ... ON TABLES` also
--     reaches matviews, partitioned tables and foreign tables — migration 379 widened the OG-25
--     census for exactly this reason, and a digest narrower than the census can miss a change
--     the census would catch.
--   * `relname`, not `oid`. Ordering by oid makes the digest depend on creation order, so
--     dropping and recreating an object with identical privileges would change it.
--   * `coalesce(relacl::text, '')` — a NULL acl means "owner default" and must be distinguished
--     from an explicit empty one.
--
-- Expected on the test server as of 2026-08-24 (M6):
--   digest      a51ee08e55ff48453d7a2925f1c5d098
--   pg_class    1105
--   pg_proc     841
--
-- These three move together and all three must be quoted; the digest alone cannot see an object
-- appearing with a NULL acl next to one disappearing that had the same name length.

SELECT
  md5(string_agg(c.relname || ':' || coalesce(c.relacl::text, ''), ',' ORDER BY c.relname))
    AS catalogue_digest,
  (SELECT count(*) FROM pg_class c2
     JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
    WHERE n2.nspname = 'public')                          AS pg_class_public,
  (SELECT count(*) FROM pg_proc p2
     JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
    WHERE n2.nspname = 'public')                          AS pg_proc_public
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public';
