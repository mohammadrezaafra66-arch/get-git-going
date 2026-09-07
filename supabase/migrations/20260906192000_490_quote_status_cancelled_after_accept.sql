SET client_encoding='UTF8';

-- ============================================================================
-- 490 - sales_quote_status gains 'cancelled_after_accept'.
-- ============================================================================
--
-- OWNER DECISION, CONTRACTS.md section 2, Q-3 -- not relitigated here:
-- a NEW status value, distinct from the existing 'canceled'. Nine quotes already
-- carry 'canceled' from cancellation BEFORE acceptance; those two histories must
-- never be conflated, which is exactly what reusing 'canceled' would do.
--
-- Measured before this migration, the live enum was:
--   draft, sent, accepted, rejected, canceled
--
-- WHY THIS IS ALONE IN ITS OWN MIGRATION
-- ---------------------------------------------------------------------------
-- This database is PostgreSQL 15.6. ALTER TYPE ... ADD VALUE may run inside a
-- transaction block, but the new label CANNOT BE USED in that same transaction:
--   ERROR: unsafe use of new value "..." of enum type
-- Every migration here is applied with --single-transaction (CLAUDE.md rule 2),
-- so the label has to be committed by one migration before migration 491 can
-- reference it in a function body, a CHECK or a comparison. Splitting them is
-- the requirement, not tidiness.
--
-- The transition rule ("permitted FROM accepted ONLY, by admin/accountant") and
-- everything cancellation does are in 491. This migration only adds the label.
-- ============================================================================

ALTER TYPE public.sales_quote_status ADD VALUE IF NOT EXISTS 'cancelled_after_accept';
