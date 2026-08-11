SET client_encoding='UTF8';

-- =============================================================================
-- 242-down — rollback for Phase 8.5 (external_parties person enforcement)
-- =============================================================================
--
-- Dropping NOT NULL loses no data. It does re-open the hole Decision 3 closed:
-- an external party could again be created without a person, and the receipt
-- and voucher flows would once more hold party references that cannot be
-- resolved to the unified person record.
--
-- This does NOT un-backfill. Persons created by the backfill stay, as do their
-- context links — removing them would orphan the parties that now point at
-- them. On this database the backfill created nothing (0 rows processed), so
-- there is nothing to undo in practice.
--
-- The accounting_party branch is removed from person_create_inline by restoring
-- the 240 definition; apply
--   supabase/migrations/20260802020000_240_person_customer_cardinality.sql
-- (its CREATE OR REPLACE FUNCTION section) to do so. Note that the external
-- parties form calls the RPC with context_kind='accounting_party', so the form
-- must be reverted to a direct .insert() in the same change or new parties will
-- be created with no external_parties row at all.
-- -----------------------------------------------------------------------------

ALTER TABLE public.external_parties ALTER COLUMN person_id DROP NOT NULL;

COMMENT ON COLUMN public.external_parties.person_id IS
  'Link to the unified person record. Nullable again after the 242 rollback.';

NOTIFY pgrst, 'reload schema';
