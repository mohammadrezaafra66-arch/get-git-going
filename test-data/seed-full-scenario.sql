-- =============================================================================
-- seed-full-scenario.sql  --  Phase 8 end-to-end fixture
-- =============================================================================
--
-- Creates the minimum complete data set the E2E scenario needs: parties that
-- have Asan codes (so they are not blocked), our own accounts, and one open
-- proforma to attach a receipt to.
--
-- ASCII ONLY.  Persian display names are inserted from a companion file,
-- test-data/seed-persian-names.sql, which MUST be applied with docker cp +
-- psql -f.  Piping Persian through PowerShell produces UTF-16 and corrupts it:
-- an incident on 2026-07-11 destroyed ~460 Persian config values exactly that
-- way.  This file stays ASCII so it can be piped safely.
--
-- TEST DATABASE ONLY.  Guarded below; it refuses to run anywhere else.
--
-- Usage:
--   docker cp test-data/seed-full-scenario.sql afrakala-lan-db:/tmp/seed.sql
--   docker exec -e PGPASSWORD=$pw afrakala-lan-db \
--     psql -U supabase_admin -d afrakala -f /tmp/seed.sql
--
-- Idempotent: safe to run repeatedly.  Every insert is ON CONFLICT DO NOTHING
-- or guarded by NOT EXISTS.
-- =============================================================================

\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';

-- ----------------------------------------------------------------- guard ----
-- Refuse to run against anything that looks like production.  A seed script
-- that runs on real data is a disaster; the cost of this check is nothing.
DO $guard$
BEGIN
  IF current_database() <> 'afrakala' THEN
    RAISE EXCEPTION 'wrong database: % (expected afrakala)', current_database();
  END IF;
  IF (SELECT count(*) FROM public.customers) > 200 THEN
    RAISE EXCEPTION 'this looks like production (% customers); refusing',
      (SELECT count(*) FROM public.customers);
  END IF;
END
$guard$;

BEGIN;

-- ------------------------------------------------------------- our banks ----
-- A cash box is a bank_accounts row with account_type='cash' (decision D2).
-- accounting_code is mandatory: post_receipt_accounting raises without it and
-- the Asan export blocks on it.

INSERT INTO public.bank_accounts (id, title, bank_name, account_type, accounting_code, currency, is_active, opening_balance)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'E2E Bank Mellat', 'Mellat', 'bank', '8',   'IRR', true, 0),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'E2E Cash Box',    'Cash',   'cash', '101', 'IRR', true, 0)
ON CONFLICT (id) DO NOTHING;

-- -------------------------------------------------------------- persons -----
-- display_name, not full_name.  Latin placeholders here; the Persian variants
-- are applied by the companion file.

INSERT INTO public.persons (id, display_name)
VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'E2E Customer With Code'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'E2E Customer Without Code'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'E2E Supplier With Code'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'E2E Dual Payer'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'E2E Dual Beneficiary'),
  ('bbbbbbbb-0000-4000-8000-000000000006', 'E2E Intermediary Sarraf')
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------------- asan person codes ------
-- The identity store.  require_asan_code reads ONLY this (decision D6) --
-- never customers.accounting_code, which can and does disagree with it.
--
-- Person ...0002 deliberately has NO code: the negative test needs a party
-- that must be refused.

INSERT INTO public.person_identifiers (person_id, kind, value_normalized, status)
VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'asan_person_code', '100001', 'provisional'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'asan_person_code', '200001', 'provisional'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'asan_person_code', '100004', 'provisional'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'asan_person_code', '200005', 'provisional'),
  ('bbbbbbbb-0000-4000-8000-000000000006', 'asan_person_code', '300006', 'provisional')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------- mobile identifiers -------
-- Three formats of ONE number, to prove normalize_identifier resolves them to
-- the same person (task 6.7 acceptance).  Stored canonical; the lookup is what
-- must normalise the input.

INSERT INTO public.person_identifiers (person_id, kind, value_normalized, status)
VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'mobile', '+989120000001', 'provisional'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'mobile', '+989120000004', 'provisional')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------ customers / suppliers -----
-- person_id is NOT NULL on both, so a customer with no person record is
-- structurally impossible.

INSERT INTO public.customers (id, name, person_id)
VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'E2E Customer With Code',    'bbbbbbbb-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-000000000002', 'E2E Customer Without Code', 'bbbbbbbb-0000-4000-8000-000000000002'),
  ('cccccccc-0000-4000-8000-000000000004', 'E2E Dual Payer',            'bbbbbbbb-0000-4000-8000-000000000004')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.suppliers (id, name, person_id)
VALUES
  ('dddddddd-0000-4000-8000-000000000003', 'E2E Supplier With Code',  'bbbbbbbb-0000-4000-8000-000000000003'),
  ('dddddddd-0000-4000-8000-000000000005', 'E2E Dual Beneficiary',    'bbbbbbbb-0000-4000-8000-000000000005')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------ external party ------
-- accounting_code is required or the Asan export blocks the whole document.

INSERT INTO public.external_parties (id, full_name, accounting_code)
VALUES
  ('eeeeeeee-0000-4000-8000-000000000006', 'E2E Intermediary Sarraf', '300006')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------- open proforma ------
-- One accepted quote for the receipt-allocation test.  Whole Toman: a
-- fractional amount is rejected at creation and blocked by the export.

INSERT INTO public.sales_quotes (id, quote_number, customer_id, customer_person_id, status, final_amount)
VALUES
  ('ffffffff-0000-4000-8000-000000000001', 'E2E-Q-0001',
   'cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   'accepted', 5000000)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ------------------------------------------------------------ verify --------
-- Read back rather than trusting the absence of an error.  Every count below
-- must match, or the scenario cannot run.

\echo '=== seed verification ==='
SELECT 'bank_accounts'  AS what, count(*) AS n, 2 AS expected FROM public.bank_accounts       WHERE id::text LIKE 'aaaaaaaa-%'
UNION ALL SELECT 'persons',            count(*), 6 FROM public.persons             WHERE id::text LIKE 'bbbbbbbb-%'
UNION ALL SELECT 'asan_codes',         count(*), 5 FROM public.person_identifiers  WHERE kind = 'asan_person_code' AND person_id::text LIKE 'bbbbbbbb-%'
UNION ALL SELECT 'customers',          count(*), 3 FROM public.customers           WHERE id::text LIKE 'cccccccc-%'
UNION ALL SELECT 'suppliers',          count(*), 2 FROM public.suppliers           WHERE id::text LIKE 'dddddddd-%'
UNION ALL SELECT 'external_parties',   count(*), 1 FROM public.external_parties    WHERE id::text LIKE 'eeeeeeee-%'
UNION ALL SELECT 'sales_quotes',       count(*), 1 FROM public.sales_quotes        WHERE id::text LIKE 'ffffffff-%';

\echo '=== the party that MUST be refused (no asan code) ==='
SELECT p.id, p.display_name
  FROM public.persons p
 WHERE p.id = 'bbbbbbbb-0000-4000-8000-000000000002'
   AND NOT EXISTS (SELECT 1 FROM public.person_identifiers i
                    WHERE i.person_id = p.id AND i.kind = 'asan_person_code');

-- =============================================================================
-- SCENARIOS THIS FIXTURE SUPPORTS
--
--  1  Bank receipt      customer ...0001 -> bank ...0001, allocated to quote
--  2  Cash receipt      customer ...0001 -> cash ...0002, tracking minted
--  3  Cheque receipt    customer ...0001, debit cheque_receivable
--  4  Bank payment      bank ...0001 -> supplier ...0003
--  5  Cash payment      cash ...0002 -> supplier ...0003
--  6  Own cheque        supplier ...0003, credit cheque_payable
--  7  Endorsed cheque   the cheque from 3, credit cheque_receivable, not reusable
--  8  Dual document     payer ...0004, beneficiary ...0005, no fee
--  9  Dual with fee     as 8 plus intermediary ...0006, three balanced lines
-- 10  NEGATIVE  no asan code   -> P0001, zero rows
-- 11  NEGATIVE  fractional     -> 22023, zero rows
-- 12  NEGATIVE  unbalanced dual-> P0001, zero rows
-- 13  NEGATIVE  wrong role     -> 42501, zero rows
-- 14  NEGATIVE  edit a posted entry -> P0001
-- 15  IDEMPOTENCY  retry the same creation -> same document, no second entry
--
-- After 1-9, each of the three Asan exports must return at least one
-- exportable document.  After 10-14, the row counts must be unchanged --
-- verify by counting, never by trusting the absence of an error.
-- =============================================================================
