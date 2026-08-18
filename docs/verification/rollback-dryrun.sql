-- rollback-dryrun.sql — prove a *-down.sql file runs, without keeping the result.
--
-- WHY THIS EXISTS — Gate A phase 2, defect M7.
--
-- Phase 2 recorded that its two rollback files were "executed in one BEGIN … ROLLBACK, exit 0;
-- create_receipt count went 1 -> 0 … ROLLBACK restored the function (count back to 1)". That
-- cannot have happened as written. Both files carried their own BEGIN; … COMMIT;, and an embedded
-- COMMIT does not stay inside an outer transaction — it commits it. Measured 2026-08-18:
--
--   BEGIN;                                   -- outer
--   CREATE TEMP TABLE gate_a_outer_marker(x int);
--   \i inner.sql                             -- contains BEGIN; CREATE TEMP TABLE …; COMMIT;
--   ROLLBACK;
--   -> outer_survived = t, inner_survived = t
--   -> WARNING: there is already a transaction in progress
--   -> WARNING: there is no transaction in progress
--
-- Both markers survived the ROLLBACK. Under that method the DROP FUNCTION in 349-down would have
-- been committed and the ROLLBACK would have restored nothing.
--
-- THE RULE THIS ESTABLISHES, for every docs/verification/*-down.sql from 350 onward:
--
--   A rollback file contains STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK.
--   The caller owns the transaction. That is the only way the file can be both
--   applied for real and dry-run.
--
--   Apply for real:
--     docker cp docs/verification/<N>-down.sql afrakala-lan-db:/tmp/down.sql
--     docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--       -v ON_ERROR_STOP=1 --single-transaction -f /tmp/down.sql
--
--   Dry-run (apply, assert, discard) — this file:
--     docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--       -v ON_ERROR_STOP=1 -v downfile=/tmp/down.sql -f /tmp/rollback-dryrun.sql
--
-- The dry-run is only trustworthy if the "after ROLLBACK" marker below shows the database back at
-- its starting state. If a down file ever carries its own COMMIT again, that marker is what
-- catches it: the state will NOT have returned.
--
-- Migrations 348-down and 349-down were written before this rule and have been corrected in place
-- to match it (Gate A M7).

SET client_encoding = 'UTF8';
\set ON_ERROR_STOP on
\pset pager off

SELECT '>>>> STATE BEFORE (outside any transaction)' AS marker,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace) AS public_functions,
       txid_current_if_assigned() IS NOT NULL AS already_in_txn;

BEGIN;

SELECT '>>>> running the down file inside a transaction we control' AS marker;

\i :downfile

SELECT '>>>> down file completed; still inside the transaction' AS marker,
       txid_current_if_assigned() IS NOT NULL AS still_in_txn;

ROLLBACK;

-- If this reports still_in_txn = false above AND no "there is no transaction in progress"
-- warning was emitted, the ROLLBACK was real and the down file kept its hands off the
-- transaction boundary.
SELECT '>>>> STATE AFTER ROLLBACK — must equal STATE BEFORE' AS marker,
       (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace) AS public_functions;
