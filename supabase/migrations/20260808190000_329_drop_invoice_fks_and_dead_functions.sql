SET client_encoding='UTF8';

-- ============================================================================
-- 329 — Condition 3, part 1: drop the two FKs to `invoices` and the three
--       invoice-only functions that now have no caller at all.
-- ============================================================================
--
-- Context: docs/execution/nav-invoices-cleanup-mission-STATUS.md, phase 4. Three
-- conditions block dropping the `invoices` table. Condition 1 was cleared by migration
-- 327. This migration clears the FK half of condition 3. The table itself is STILL NOT
-- dropped -- condition 2 (de-registering invoices.customer_person_id from the
-- person_merge registry, in the same migration as the DROP) remains open.
--
-- ---------------------------------------------------------------------------
-- The two foreign keys
-- ---------------------------------------------------------------------------
-- PostgreSQL refuses to drop a referenced table, so these two must go before the table
-- ever can. Both were measured on the live database immediately before this migration:
--   payment_receipt_links : 3 rows, ZERO with a non-null invoice_id
--   delivery_receipts     : 1 row,  ZERO with a non-null invoice_id
-- So no row loses a parent and no lookup changes. The `invoice_id` COLUMNS are kept:
-- enforce_payment_receipt_link_limits and other functions still read them, and removing
-- the columns is part of the later cleanup, not this one.
--
-- ---------------------------------------------------------------------------
-- The three functions
-- ---------------------------------------------------------------------------
-- Verified to have zero callers, in the frontend AND inside the database:
--   cancel_invoice                -- 0 src refs, 0 DB refs, not a trigger
--   send_invoice_to_accountant    -- 0 src refs, 0 DB refs, not a trigger
--   set_invoice_accounting_marker -- its only src caller was
--                                    src/components/invoices/InvoiceAccountingMarkers.tsx,
--                                    which this commit deletes: migration 323 removed the
--                                    invoice routes that imported it and left the
--                                    component orphaned, importing nothing and imported
--                                    by nothing.
--
-- Deliberately NOT dropped, and why -- each still has a live consumer:
--   complete_invoice_task            -- called from /operations/tasks, a sidebar page
--   create_preinvoice_workflow_tasks -- backs trigger trg_create_preinvoice_workflow_tasks
--                                       ON invoices, which still exists
--   invoices_log_type_changes        -- trigger ON invoices, ditto
-- These three go with the table, not before it.
--
-- Down-script: docs/verification/329-down.sql
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Prove the premise before acting on it. If a row ever acquired an invoice_id
--    between the measurement and this run, stop rather than silently orphan it.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE _prl int; _dr int;
BEGIN
  SELECT count(*) INTO _prl FROM public.payment_receipt_links WHERE invoice_id IS NOT NULL;
  SELECT count(*) INTO _dr  FROM public.delivery_receipts     WHERE invoice_id IS NOT NULL;
  IF _prl <> 0 OR _dr <> 0 THEN
    RAISE EXCEPTION
      '329: refusing to drop the FKs — payment_receipt_links has % row(s) and delivery_receipts % row(s) with a non-null invoice_id. Someone started using the invoice link; re-assess before continuing.',
      _prl, _dr;
  END IF;
END
$do$;

-- ----------------------------------------------------------------------------
-- 2. Drop the two foreign keys.
-- ----------------------------------------------------------------------------
ALTER TABLE public.payment_receipt_links DROP CONSTRAINT IF EXISTS payment_receipt_links_invoice_id_fkey;
ALTER TABLE public.delivery_receipts     DROP CONSTRAINT IF EXISTS delivery_receipts_invoice_id_fkey;

-- ----------------------------------------------------------------------------
-- 3. Drop the three caller-less functions, by explicit signature (AGENTS.md rule 5).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.cancel_invoice(uuid);
DROP FUNCTION IF EXISTS public.send_invoice_to_accountant(uuid);
DROP FUNCTION IF EXISTS public.set_invoice_accounting_marker(uuid, text, boolean);

-- ----------------------------------------------------------------------------
-- 4. Assert the outcome inside the same transaction.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE _fks int; _gone int; _kept int;
BEGIN
  SELECT count(*) INTO _fks FROM pg_constraint
   WHERE contype = 'f' AND confrelid = 'public.invoices'::regclass;
  IF _fks <> 0 THEN
    RAISE EXCEPTION '329: expected 0 FKs left pointing at invoices, found %', _fks;
  END IF;

  SELECT count(*) INTO _gone FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('cancel_invoice','send_invoice_to_accountant','set_invoice_accounting_marker');
  IF _gone <> 0 THEN
    RAISE EXCEPTION '329: expected the 3 invoice-only functions to be gone, found %', _gone;
  END IF;

  -- The three that must survive, because they still have live consumers.
  SELECT count(*) INTO _kept FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
     ('complete_invoice_task','create_preinvoice_workflow_tasks','invoices_log_type_changes');
  IF _kept <> 3 THEN
    RAISE EXCEPTION '329: the 3 still-needed functions must remain, found %', _kept;
  END IF;

  IF to_regclass('public.invoices') IS NULL THEN
    RAISE EXCEPTION '329: invoices must still exist — dropping it is a later, separately gated step';
  END IF;

  -- The person FK registry must still balance; 328's event trigger enforces this on the
  -- ALTER TABLEs above, but assert it explicitly so the intent is on the record.
  PERFORM public.assert_person_fk_registry();

  RAISE NOTICE '329 OK: 0 FKs to invoices, 3 functions dropped, 3 kept, invoices intact, person registry balanced';
END
$do$;
