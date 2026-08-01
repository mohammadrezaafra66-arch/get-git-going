SET client_encoding='UTF8';

-- =============================================================================
-- 243-down — rollback for Phase 8.6 (credit functions person-based)
-- =============================================================================
--
-- This rollback is unusually safe, for a reason worth stating: migration 243
-- changed only which column identifies the party, and numeric parity was proven
-- in both directions on real data (12 customers x 4 read functions, and 8
-- customers x 3 mutating functions, byte-identical). Rolling back therefore
-- also cannot move a number.
--
-- HOW TO ROLL BACK
--   Re-apply the eight pre-243 definitions verbatim from the snapshot taken
--   before the rewrite:
--       docs/verification/pre-phase8/credit-functions-snapshot.sql
--   That file is a pg_get_functiondef dump of the LIVE functions as they stood
--   at the start of Phase 8, so it is authoritative in a way a hand-written
--   rollback would not be. Extract the eight functions listed below and apply
--   them; every one is a CREATE OR REPLACE with an unchanged signature, so
--   re-applying replaces rather than overloads (rule 5).
--
--       _ensure_credit_balance(uuid)
--       get_customer_credit(uuid)
--       get_customer_dynamic_credit(uuid)
--       hold_credit(uuid, numeric, uuid, uuid)
--       release_credit(uuid, numeric, uuid, uuid)
--       increase_credit(uuid, numeric, uuid, uuid)
--       can_use_customer_capital_allocation(uuid, numeric)
--       hold_capital_allocation(uuid, numeric, uuid, uuid)
--
--   A machine-readable copy of the post-243 state is kept alongside it at
--   docs/verification/post-243/credit-functions-after.sql so the two can be
--   diffed at any time to confirm what the rollback would undo.
--
-- ORDERING CONSTRAINT
--   Roll this back BEFORE 240-down. The rewritten functions assume one person
--   resolves to exactly one customer, which is what uq_customers_person_id
--   guarantees. Dropping that constraint while 243 is still in place would let
--   a person acquire a second customer row and make the person-keyed lookups
--   non-deterministic. Rolling back in this order avoids that window entirely.
-- -----------------------------------------------------------------------------

\echo 'To roll back Phase 8.6, apply the eight function definitions from:'
\echo '  docs/verification/pre-phase8/credit-functions-snapshot.sql'
\echo 'Roll 243 back BEFORE 240 - see the ordering note in this file.'
