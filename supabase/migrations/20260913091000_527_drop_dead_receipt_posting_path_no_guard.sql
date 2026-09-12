SET client_encoding = 'UTF8';

-- 527 -- 336's work, re-issued without the `current_database() <> 'afrakala'` guard.
--
-- 336 (20260818150000_336_drop_dead_receipt_posting_path.sql) carries, verbatim at lines 29-35:
--
--     DO $guard$
--     BEGIN
--       IF current_database() <> 'afrakala' THEN
--         RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
--       END IF;
--     END
--     $guard$;
--
-- Production's database is named `postgres`, not `afrakala` (see CLAUDE.md's working-environments
-- table). So 336 aborted on production the moment it ran -- the same class of failure that broke
-- migration 477 on 2026-09-12. 336 is NOT edited (CLAUDE.md rule 6); this migration does its work
-- instead and gets its own ledger row. 336's own ledger row is marked superseded in the release,
-- which the orchestrator handles -- not this file.
--
-- WHAT 336 ASSERTED, measured independently on prod_rehearsal_e1 rather than trusted from R-1:
--   * post_receipt_journal(_receipt_id uuid) EXISTS on production (confirmed:
--     `SELECT ... WHERE proname='post_receipt_journal'` returns one row).
--   * trg_payment_receipts_post_journal is ALREADY ABSENT on production (confirmed: zero rows in
--     pg_trigger for that name) -- so 336's trigger-drop half is a no-op here, and only the
--     function drop has real work to do.
--
-- CATALOGUE-DRIVEN AND IDEMPOTENT: both statements use IF EXISTS, so a second application of this
-- file is a clean no-op (DROP ... IF EXISTS on an absent object succeeds silently) -- proved by
-- running it twice on a fresh restore in docs/research/convergence/E-1-proof.md.
--
-- CALLER CHECK (CLAUDE.md rule 5 spirit -- read before dropping, don't trust the file alone):
-- confirmed below via a live catalogue scan that no function source in `public` references
-- post_receipt_journal before the DROP runs. R-1 already established this fact (post_receipt_journal
-- has exactly one historical caller, trg_post_receipt_on_approve, and that trigger function's body
-- calling a dropped function is inert dead code once its own trigger is gone) -- this migration
-- re-verifies it live rather than trusting the prior report.
--
-- ROLLBACK: docs/verification/336-down.sql already exists (captured from live before 336's own
-- drop) and restores the same objects; it is the correct rollback for this file too since the two
-- drop the same targets.

DO $pre527$
DECLARE
  v_callers text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'post_receipt_journal') THEN
    SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_callers
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosrc ~ 'post_receipt_journal\s*\('
       AND p.proname <> 'post_receipt_journal';
    IF v_callers IS NOT NULL THEN
      RAISE EXCEPTION '527: refusing to drop post_receipt_journal -- source scan found possible caller(s): %. This must be resolved by a human before the function is removed.', v_callers;
    END IF;
    RAISE NOTICE '527: [precheck] no other function in public source-references post_receipt_journal(...) -- safe to drop';
  END IF;
END
$pre527$;

DROP TRIGGER IF EXISTS trg_payment_receipts_post_journal ON public.payment_receipts;

DROP FUNCTION IF EXISTS public.post_receipt_journal(_receipt_id uuid);

DO $verify527$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'post_receipt_journal') THEN
    RAISE EXCEPTION '527: post_receipt_journal still exists after drop';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payment_receipts_post_journal') THEN
    RAISE EXCEPTION '527: trg_payment_receipts_post_journal still exists after drop';
  END IF;
  RAISE NOTICE '527 OK: post_receipt_journal and trg_payment_receipts_post_journal are both absent';
END
$verify527$;
