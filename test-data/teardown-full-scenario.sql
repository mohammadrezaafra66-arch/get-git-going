-- =============================================================================
-- Teardown for `seed-full-scenario.sql`.
--
-- WHY THIS FILE HAD TO EXIST BEFORE THE SEED COULD BE RUN AT ALL.
-- The owner's condition for authorising the seed was: only marked rows, and only rows whose
-- cleanup can be PROVEN. The seed had no teardown of any kind, so every run would have left its
-- rows behind permanently — and that is not a hypothetical cost. It is exactly the cycle that
-- produced OG-56's two undeletable journal entries and, later, OG-76's receipt: residue that
-- nobody can remove, that every later count has to be taught to ignore, and that shifts the
-- baseline of unrelated specs (mission 11: one dying teardown moved seven specs' baselines).
--
-- HOW DELETION IS SCOPED. By the seed's own fixed UUID prefixes, never by name and never by a
-- marker like `LIKE 'E2E%'`. This is OG-56's lesson: a marker-wide predicate deletes whatever
-- happens to share the prefix, including another spec's data or the owner's. Each id below is
-- one the seed itself wrote.
--
-- ORDER IS FOREIGN-KEY ORDER, children first. Getting it wrong is how mission 11's teardown
-- died on `suppliers_person_id_fkey` and left its whole fixture behind.
--
-- WHAT THIS DELIBERATELY DOES NOT DELETE: anything posted. The seed creates no
-- `journal_entries` and no posted document — verified, and asserted at the end of this file —
-- because the immutability trigger refuses to delete a posted entry even for a superuser. A row
-- that cannot be deleted must not be created, so the correct place to enforce that is here, by
-- proving there is nothing of the kind to clean up.
--
-- Safe to run when the seed was never applied: every DELETE is scoped to ids that then match
-- nothing, and the file is idempotent.
-- =============================================================================

\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';

-- The same guard the seed carries. A teardown pointed at the wrong database is worse than a
-- seed pointed at it.
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

-- Refuse to delete anything if the seed's ids somehow acquired a POSTED document. That would
-- mean a test created one against a seeded party, and deleting the party underneath it would
-- either fail on a foreign key or orphan a ledger row.
DO $posted$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.journal_entries je
   WHERE je.status = 'posted'
     AND je.source_id IN (
       SELECT id FROM public.payment_receipts
        WHERE customer_id IN ('cccccccc-0000-4000-8000-000000000001',
                              'cccccccc-0000-4000-8000-000000000002',
                              'cccccccc-0000-4000-8000-000000000004')
       UNION ALL
       SELECT id FROM public.payment_vouchers
        WHERE payee_supplier_id IN ('dddddddd-0000-4000-8000-000000000003',
                                    'dddddddd-0000-4000-8000-000000000005')
     );
  IF v_n > 0 THEN
    RAISE EXCEPTION
      'teardown refused: % posted journal entr(ies) reference seeded parties. Reverse those documents with reverse_document() first; deleting the parties underneath them would orphan the ledger.', v_n;
  END IF;
END
$posted$;

BEGIN;

-- ---------------------------------------------------------------- children --
-- Documents first: they reference the parties, and the parties reference the persons.
DELETE FROM public.payment_receipts
 WHERE customer_id IN ('cccccccc-0000-4000-8000-000000000001',
                       'cccccccc-0000-4000-8000-000000000002',
                       'cccccccc-0000-4000-8000-000000000004');

DELETE FROM public.payment_vouchers
 WHERE payee_supplier_id IN ('dddddddd-0000-4000-8000-000000000003',
                             'dddddddd-0000-4000-8000-000000000005')
    OR payee_party_id = 'eeeeeeee-0000-4000-8000-000000000006';

DELETE FROM public.dual_documents
 WHERE payer_customer_id = 'cccccccc-0000-4000-8000-000000000004'
    OR beneficiary_supplier_id = 'dddddddd-0000-4000-8000-000000000005'
    OR payer_party_id = 'eeeeeeee-0000-4000-8000-000000000006'
    OR beneficiary_party_id = 'eeeeeeee-0000-4000-8000-000000000006';

DELETE FROM public.sales_quotes WHERE id = 'ffffffff-0000-4000-8000-000000000001';

-- ------------------------------------------------------------ role tables --
-- BEFORE persons. `suppliers.person_id` and `customers.person_id` are NOT NULL foreign keys, so
-- deleting persons first raises `suppliers_person_id_fkey` — which is precisely how mission 11's
-- teardown died and left its whole fixture behind.
DELETE FROM public.external_parties WHERE id = 'eeeeeeee-0000-4000-8000-000000000006';
DELETE FROM public.suppliers WHERE id IN ('dddddddd-0000-4000-8000-000000000003',
                                          'dddddddd-0000-4000-8000-000000000005');
DELETE FROM public.customers WHERE id IN ('cccccccc-0000-4000-8000-000000000001',
                                          'cccccccc-0000-4000-8000-000000000002',
                                          'cccccccc-0000-4000-8000-000000000004');

-- -------------------------------------------------------------- identity ---
DELETE FROM public.person_identifiers
 WHERE person_id IN ('bbbbbbbb-0000-4000-8000-000000000001',
                     'bbbbbbbb-0000-4000-8000-000000000002',
                     'bbbbbbbb-0000-4000-8000-000000000003',
                     'bbbbbbbb-0000-4000-8000-000000000004',
                     'bbbbbbbb-0000-4000-8000-000000000005',
                     'bbbbbbbb-0000-4000-8000-000000000006');

DELETE FROM public.persons
 WHERE id IN ('bbbbbbbb-0000-4000-8000-000000000001',
              'bbbbbbbb-0000-4000-8000-000000000002',
              'bbbbbbbb-0000-4000-8000-000000000003',
              'bbbbbbbb-0000-4000-8000-000000000004',
              'bbbbbbbb-0000-4000-8000-000000000005',
              'bbbbbbbb-0000-4000-8000-000000000006');

DELETE FROM public.bank_accounts
 WHERE id IN ('aaaaaaaa-0000-4000-8000-000000000001',
              'aaaaaaaa-0000-4000-8000-000000000002');

COMMIT;

-- ------------------------------------------------------------- verify ------
-- Read back rather than trusting the absence of an error. This is the "provable cleanup" half
-- of the owner's condition: every count must be zero, or the seed is not safe to run again.
\echo '=== teardown verification (every count must be 0) ==='
SELECT
  (SELECT count(*) FROM public.persons
    WHERE id::text LIKE 'bbbbbbbb-0000-4000-8000-%')            AS persons,
  (SELECT count(*) FROM public.person_identifiers
    WHERE person_id::text LIKE 'bbbbbbbb-0000-4000-8000-%')     AS identifiers,
  (SELECT count(*) FROM public.customers
    WHERE id::text LIKE 'cccccccc-0000-4000-8000-%')            AS customers,
  (SELECT count(*) FROM public.suppliers
    WHERE id::text LIKE 'dddddddd-0000-4000-8000-%')            AS suppliers,
  (SELECT count(*) FROM public.external_parties
    WHERE id::text LIKE 'eeeeeeee-0000-4000-8000-%')            AS external_parties,
  (SELECT count(*) FROM public.sales_quotes
    WHERE id::text LIKE 'ffffffff-0000-4000-8000-%')            AS quotes,
  (SELECT count(*) FROM public.bank_accounts
    WHERE id::text LIKE 'aaaaaaaa-0000-4000-8000-%')            AS bank_accounts;
