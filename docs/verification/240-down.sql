SET client_encoding='UTF8';

-- =============================================================================
-- 240-down — rollback for Phase 8.3 (one person = one customer/supplier)
-- =============================================================================
--
-- Dropping the constraints is clean and loses no data: uniqueness is a rule,
-- not a column. What it does NOT restore is person_create_inline's original
-- unconditional-INSERT behaviour — that is re-created below from the 232
-- definition, minus the reuse branch.
--
-- ⚠️ Do not run this while checkpoint 8.6 is in place. The credit functions
--    rewritten in migration 243 resolve a person to exactly one customer and
--    rely on this constraint to guarantee that. Removing it without also
--    rolling back 243 would let a person acquire a second customer row and
--    make credit lookups non-deterministic.
-- -----------------------------------------------------------------------------

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS uq_customers_person_id;
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS uq_suppliers_person_id;

-- Restore the pre-240 person_create_inline (migration 232 definition).
-- The full prior text is kept at
--   docs/verification/pre-phase8/person_create_inline-before-240.sql
-- Apply that file to restore it verbatim; it is the authoritative source.
\echo 'To restore person_create_inline, apply:'
\echo '  docs/verification/pre-phase8/person_create_inline-before-240.sql'

NOTIFY pgrst, 'reload schema';
