SET client_encoding='UTF8';

-- P0.3 - Delete the e2e purchase residue and its dependents.
--
-- MISSION NUMBERS CORRECTED AGAINST LIVE DATA (2026-08-07):
--   P0_CLEANUP.md says "84 e2e purchase residue rows", grown to "~334", and a
--   follow-up instruction described "84 test purchases sharing journal entries
--   with 93 real ones". None of those numbers survive contact:
--     purchases total                     334
--     notes LIKE 'E2E%'                   322   <- the residue
--     notes NOT LIKE 'E2E%' (non-null)      2
--     notes IS NULL                        10
--     => real (non-residue) purchases      12   (not 93)
--   There is NO journal-entry entanglement to split. public.journal_entries
--   holds exactly ONE row in the entire database and its source_type is
--   'payment_receipt'; journal entries sourced from ANY purchase = 0.
--   The "surgically split the shared journal entries" problem does not exist.
--
-- Dependent census for the 322 targets (live):
--   purchase_items                  322  (FK, explicit)
--   purchase_idempotency            320  (FK, explicit)
--   purchase_request_fulfillments   158  (FK, explicit)
--   stock_movements                 322  (ref_type='purchase', ref_id -> purchases.
--                                        POLYMORPHIC, NO FK - these would be
--                                        orphaned silently if not deleted here)
--   payment_vouchers                  0  (financial - none, verified)
--   journal_entries                   0  (financial - none, verified)
--
-- stock_movements totals by ref_type: purchase 332, transfer 2,
-- sale_quote_confirm 1. Deleting 322 leaves 10 purchase-sourced movements,
-- matching the 10 null-notes purchases that are being kept.
--
-- INVENTORY EFFECT: removing 322 purchase stock_movements lowers computed
-- stock for the affected products. That is the intended correction - the e2e
-- runs inflated stock - but it is a visible change, not a no-op.
--
-- Backup: docs/verification/P0.3-purchase-cleanup-backup.sql
--         (pg_dump --data-only of all five tables, 598,438 bytes)
-- Down:   docs/verification/304-down.sql

-- Transaction control belongs to the caller (psql --single-transaction).
CREATE TEMP TABLE _p03_targets(purchase_id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _p03_targets(purchase_id)
  SELECT id FROM public.purchases WHERE notes LIKE 'E2E%';

-- Guard 1: the target set must be the expected size. If a concurrent e2e run
-- added more, stop rather than delete an unbounded set.
DO $$
DECLARE _n int;
BEGIN
  SELECT count(*) INTO _n FROM _p03_targets;
  IF _n <> 322 THEN
    RAISE EXCEPTION 'P0.3 aborted: expected 322 e2e purchases, found %. Re-census before running.', _n;
  END IF;
END $$;

-- Guard 2: refuse if any target has acquired financial weight since the census.
DO $$
DECLARE _bad int;
BEGIN
  SELECT (SELECT count(*) FROM public.payment_vouchers
           WHERE purchase_id IN (SELECT purchase_id FROM _p03_targets))
       + (SELECT count(*) FROM public.journal_entries
           WHERE source_id IN (SELECT purchase_id FROM _p03_targets))
    INTO _bad;
  IF _bad > 0 THEN
    RAISE EXCEPTION 'P0.3 aborted: % financial row(s) now reference the e2e purchases.', _bad;
  END IF;
END $$;

-- Dependency order. stock_movements first: it has no FK, so nothing protects it.
DELETE FROM public.stock_movements
 WHERE ref_type = 'purchase'
   AND ref_id IN (SELECT purchase_id FROM _p03_targets);

DELETE FROM public.purchase_request_fulfillments
 WHERE purchase_id IN (SELECT purchase_id FROM _p03_targets);

DELETE FROM public.purchase_idempotency
 WHERE purchase_id IN (SELECT purchase_id FROM _p03_targets);

DELETE FROM public.purchase_items
 WHERE purchase_id IN (SELECT purchase_id FROM _p03_targets);

DELETE FROM public.purchases
 WHERE id IN (SELECT purchase_id FROM _p03_targets);

-- Assert the intended end state inside the transaction.
DO $$
DECLARE _left int; _kept int; _sm int;
BEGIN
  SELECT count(*) INTO _left FROM public.purchases WHERE notes LIKE 'E2E%';
  IF _left <> 0 THEN
    RAISE EXCEPTION 'P0.3 failed: % e2e purchase(s) survived.', _left;
  END IF;

  SELECT count(*) INTO _kept FROM public.purchases;
  IF _kept <> 12 THEN
    RAISE EXCEPTION 'P0.3 failed: expected 12 surviving purchases, found %.', _kept;
  END IF;

  SELECT count(*) INTO _sm FROM public.stock_movements WHERE ref_type='purchase';
  IF _sm <> 10 THEN
    RAISE EXCEPTION 'P0.3 failed: expected 10 purchase stock_movements, found %.', _sm;
  END IF;

  -- No dependent may outlive its purchase.
  SELECT (SELECT count(*) FROM public.purchase_items pi
           WHERE NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.id=pi.purchase_id))
       + (SELECT count(*) FROM public.purchase_idempotency pk
           WHERE pk.purchase_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.id=pk.purchase_id))
       + (SELECT count(*) FROM public.purchase_request_fulfillments pf
           WHERE NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.id=pf.purchase_id))
       + (SELECT count(*) FROM public.stock_movements sm
           WHERE sm.ref_type='purchase'
             AND NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.id=sm.ref_id))
    INTO _left;
  IF _left <> 0 THEN
    RAISE EXCEPTION 'P0.3 failed: % orphaned dependent row(s) remain.', _left;
  END IF;
END $$;
