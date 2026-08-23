-- schema-migrations-backfill.sql — repair `supabase_migrations.schema_migrations`, which is frozen.
--
-- *** THIS FILE MUST NEVER BE MOVED INTO supabase/migrations/. ***
--
-- Phase 9 replays `supabase/migrations/` against production. This file writes to the migration
-- BOOKKEEPING schema, not to the application schema. Replaying it against production would stamp
-- production's ledger with versions that were applied on the TEST box, and a later replay would
-- then skip those migrations there — the exact failure this repair exists to prevent, inverted.
-- It is stored under docs/verification/ for the same reason
-- `phase-2-remediation-testdata-cleanup.sql` is: it is a data repair, not a schema change.
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction.
-- INSERTs only. No DELETE, no UPDATE. Idempotent via ON CONFLICT DO NOTHING on the primary key.
--
-- WHY THE TABLE IS WRONG. It stops at version 20260811180000 and holds 523 rows, while
-- `supabase/migrations/` holds 568 files. The 45 files in between — migrations 336 to 380, the
-- entire ledger programme plus the two security missions — have no row. Nothing writes that table
-- on this box; migrations here are applied by hand with `docker cp` + `psql -f`.
--
-- WHY ONLY 29 OF THE 45 ARE WRITTEN. Each of the 45 was probed against the live catalogue for the
-- object it names. 29 are provable: the table, column, index, policy, trigger, constraint or
-- function body they created is there, and is attributable to that migration and no other.
--
-- The other 16 are NOT written, deliberately, and they are listed in
-- `docs/execution/bookkeeping-record-reconciliation-PROGRESS.md` with the reason for each. They
-- fall into two groups:
--
--   * Seven are superseded `CREATE OR REPLACE` migrations — 349, 350, 356, 358, 359, 361, 366.
--     A later migration in the same chain overwrote the body, so the live definition proves the
--     LAST writer ran and says nothing about the earlier ones. If 349 had never run and 351 had,
--     the database would look exactly as it does now.
--
--     340 and 355 were in this group until an independent review pointed out that the probe read
--     function BODIES only. `COMMENT ON FUNCTION` writes a `pg_description` row, which is a separate
--     catalogue object that `CREATE OR REPLACE` PRESERVES. Both wrote one, both are the only file in
--     all 568 that writes that comment, and neither of their later writers (346 for
--     require_asan_code; 356 and 364 for create_payment) issues any `COMMENT ON` at all. So the live
--     comment can only have come from them. `create_payment`'s live comment even names its own
--     migration: "…in one transaction (phase 3, migration 355)". Both are now written.
--
--     356 also created `payment_vouchers_endorsed_receipt_unique_idx`, which looks durable — but
--     migration 363 does an unconditional `DROP INDEX` + `CREATE UNIQUE INDEX` with its own
--     definition and its own comment, and the live index carries 363's `reversed_at IS NULL` clause.
--     So 356 genuinely leaves no trace and stays excluded.
--   * Nine leave no trace at all — 371, 372, 375, 378, 379, 380 create no object and only assert;
--     374, 376, 377 grant privileges `anon` already held, so the catalogue does not move.
--
-- Writing a row that cannot be proved is worse than leaving one out. A missing row makes a replay
-- RE-RUN the migration, which for every one of these 16 is safe — they are idempotent, assertions,
-- or `CREATE OR REPLACE` statements that a replay executes in file order anyway. A wrongly written
-- row makes a replay SKIP a migration that may never have run, and nothing later would notice.
--
-- READ THAT QUALIFIER CAREFULLY — "in file order" is load-bearing, and phase 9 must honour it.
-- It is true for phase 9's model, which replays the whole directory from scratch in order against a
-- fresh production ledger. It is NOT true for a GAP-DRIVEN replay — one that runs only the versions
-- absent from this table. In that mode the seven superseded exclusions (349, 350, 356, 358, 359,
-- 361, 366) would run in ISOLATION, out of chain order, and a `CREATE OR REPLACE` executed alone
-- reverts its object to an older body.
--
-- That is not hypothetical, and it is why 340 and 355 had to be written rather than left out:
--
--   * 340 declares `SECURITY DEFINER`. The live `require_asan_code` has `prosecdef = false`,
--     because migration 346 removed it — 346's own header calls it "an RLS bypass". Running 340
--     alone would restore that bypass.
--   * 355 has zero references to `reversed_at`; 364 has seventeen and the live body carries them.
--     Running 355 alone would strip 364's reversal guard and 356's endorsement-consumed-once rule.
--
-- Whoever owns phase 9: replay this directory in order, whole. Do not drive it from the gaps in
-- this table.
--
-- Column set matched to the live table exactly: `version` text NOT NULL (primary key) and
-- `inserted_at` timestamptz DEFAULT now(). The existing 523 rows all carry a single bulk
-- `inserted_at`; these rows take the default, which honestly records when the repair was made
-- rather than backdating it to a time nobody measured.
--
-- Applied by hand on the test server 2026-08-23. PostgREST was NOT restarted, and did not need to
-- be: no schema object changed and nothing in the exposed schema moved.

SET client_encoding = 'UTF8';

INSERT INTO supabase_migrations.schema_migrations (version) VALUES
  ('20260818150000'),  -- 336  20260818150000_336_drop_dead_receipt_posting_path.sql
  ('20260818151000'),  -- 337  20260818151000_337_jalali_year_helper.sql
  ('20260818152000'),  -- 338  20260818152000_338_document_numbers.sql
  ('20260818153000'),  -- 339  20260818153000_339_lock_down_burn_document_number.sql
  ('20260818154000'),  -- 340  20260818154000_340_require_asan_code.sql
  ('20260818155000'),  -- 341  20260818155000_341_cheque_kinds_and_doc_kind.sql
  ('20260818156000'),  -- 342  20260818156000_342_document_attachments.sql
  ('20260818157000'),  -- 343  20260818157000_343_posted_entry_immutability.sql
  ('20260818158000'),  -- 344  20260818158000_344_seed_ledger_documents_module.sql
  ('20260818160000'),  -- 345  20260818160000_345_writers_supply_doc_kind.sql
  ('20260818161000'),  -- 346  20260818161000_346_gate_a_major_fixes.sql
  ('20260818170000'),  -- 347  20260818170000_347_cheque_external_party_counterparties.sql
  ('20260818180000'),  -- 348  20260818180000_348_receipt_cheque_receiver_check.sql
  ('20260819091000'),  -- 351  20260819091000_351_create_receipt_cash_account_and_date_bounds.sql
  ('20260819092000'),  -- 352  20260819092000_352_og13_remaining_surfaces.sql
  ('20260819093000'),  -- 353  20260819093000_353_block_receipt_delete_when_posted.sql
  ('20260819100000'),  -- 354  20260819100000_354_payment_voucher_endorsed_cheque_ref.sql
  ('20260819101000'),  -- 355  20260819101000_355_create_payment.sql
  ('20260819111000'),  -- 357  20260819111000_357_block_voucher_delete_when_posted.sql
  ('20260819130000'),  -- 360  20260819130000_360_dual_documents_table.sql
  ('20260819140000'),  -- 362  20260819140000_362_dual_document_no_fee.sql
  ('20260819150000'),  -- 363  20260819150000_363_reverse_document_schema.sql
  ('20260819151000'),  -- 364  20260819151000_364_reverse_document.sql
  ('20260819160000'),  -- 365  20260819160000_365_reverse_document_gate_a.sql
  ('20260819180000'),  -- 367  20260819180000_367_asan_export_filters.sql
  ('20260821120000'),  -- 368  20260821120000_368_close_payment_voucher_insert_path.sql
  ('20260821121000'),  -- 369  20260821121000_369_ledger_derived_balance_readers.sql
  ('20260822143000'),  -- 370  20260822143000_370_close_anon_read_on_viewer_guard_views.sql
  ('20260822210000')   -- 373  20260822210000_373_close_anon_default_privileges.sql
ON CONFLICT (version) DO NOTHING;
