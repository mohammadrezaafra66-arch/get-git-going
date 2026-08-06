SET client_encoding='UTF8';

-- P0.1 — Delete unambiguous test-marker person rows.
--
-- Investigation (live, 2026-08-07) found that the "9 test person rows" the
-- mission file names are NOT all garbage. Classification of every
-- test-marker person on the live database:
--
--   DELETABLE (this migration) — test rows, zero dependents, no auth identity:
--     19bb3abd  'تست تامین کننده'  ("test supplier" — the marker the mission names)
--     6358926a  'تست دستی من'      ("my manual test", note: backfilled by mig 233)
--
--   NOT DELETED — live e2e harness auth identities (auth.users + profiles +
--   user_roles + staff_link). The program's own gates (P3.2 role visibility,
--   P5.4 RLS pass) require these six accounts:
--     test.admin / test.manager / test.sales / test.sales2 /
--     test.accountant / test.viewer  @afrakala.local
--
--   NOT DELETED — rejected real signups with auth.users rows behind them:
--     e205276f 'test232'  (afrakalatest@gmail.com)
--     a05edc6c 'test 12'  (chista@gmail.com, holds mobile +989921680268)
--
--   NOT DELETED — permanent spec fixture, upserted by design every run
--   (e2e/security/persons-rls-ownership.spec.ts:93 documents the fixed id):
--     eeeeeeee-0000-4000-8000-0000000e2e64  'E2E264 ...'
--
--   NOT DELETED — mission file step 3 stop condition: test-marker persons that
--   carry real transactions. Reported, not touched:
--     bf3dc235 'تست 2.1'          9 sales_quotes
--     c3fd037c 'تست ماهرو'        1 sales_quote + asan code 1125623
--     38dbcaad "kjbjhvjhvbkl'p;"  4 payment_receipts
--     dc76b4a6 '12'               1 purchase + supplier row + profile
--
--   NOT DELETED — ambiguous provenance, flagged for the owner:
--     6cd30201 'api'  supplier auto-created from a product suggestion
--                     (note names product AFK-2026-00033). Zero transactions,
--                     but it is product-suggestion residue, not a test person.
--
-- Dependent census for the two deleted rows (both FK paths, live):
--   purchases(supplier_id)=0  product_suppliers=0  purchase_prices=0
--   payment_vouchers=0  person_aliases=0  person_field_values=0
--   person_identifiers=0  asan_import_person_rows=0
--   person_context_links=1 each (CASCADE), person_merge_candidates=1 for
--   6358926a (CASCADE), suppliers=1 each (NO ACTION — deleted explicitly).

-- Transaction control belongs to the caller (psql --single-transaction).
CREATE TEMP TABLE _p01_targets(person_id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _p01_targets(person_id) VALUES
  ('19bb3abd-f6fb-4527-9844-09eb896f7d2d'),
  ('6358926a-3938-4aca-8d7e-f7998fac233a');

-- Guard: refuse to run if any target has acquired a transaction since the
-- census above. A test row that grew a purchase is no longer a test row.
DO $$
DECLARE
  _bad int;
BEGIN
  SELECT count(*) INTO _bad
    FROM _p01_targets t
    LEFT JOIN public.suppliers s ON s.person_id = t.person_id
   WHERE (SELECT count(*) FROM public.purchases pu
           WHERE pu.supplier_person_id = t.person_id OR pu.supplier_id = s.id) > 0
      OR (SELECT count(*) FROM public.sales_quotes q
           WHERE q.customer_person_id = t.person_id) > 0
      OR (SELECT count(*) FROM public.payment_receipts r
           WHERE r.customer_person_id = t.person_id
              OR r.receiver_party_person_id = t.person_id) > 0
      OR (SELECT count(*) FROM public.payment_vouchers v
           WHERE v.payee_person_id = t.person_id OR v.payee_supplier_id = s.id) > 0
      OR (SELECT count(*) FROM public.product_suppliers ps
           WHERE ps.supplier_person_id = t.person_id OR ps.supplier_id = s.id) > 0
      OR (SELECT count(*) FROM public.purchase_prices pp
           WHERE pp.supplier_person_id = t.person_id OR pp.supplier_id = s.id) > 0
      OR (SELECT count(*) FROM public.profiles pr
           WHERE pr.person_id = t.person_id) > 0;
  IF _bad > 0 THEN
    RAISE EXCEPTION
      'P0.1 aborted: % target person(s) now carry transactions or a profile.', _bad;
  END IF;
END $$;

-- Explicit dependency order. The CASCADE relationships would cover the person_*
-- children on their own, but deleting them by name keeps the row counts visible.
DELETE FROM public.person_merge_candidates
 WHERE person_id_a IN (SELECT person_id FROM _p01_targets)
    OR person_id_b IN (SELECT person_id FROM _p01_targets);

DELETE FROM public.person_field_values
 WHERE person_id IN (SELECT person_id FROM _p01_targets);

DELETE FROM public.person_aliases
 WHERE person_id IN (SELECT person_id FROM _p01_targets);

DELETE FROM public.person_identifiers
 WHERE person_id IN (SELECT person_id FROM _p01_targets);

DELETE FROM public.person_context_links
 WHERE person_id IN (SELECT person_id FROM _p01_targets);

-- suppliers.person_id is ON DELETE NO ACTION, so this must precede the persons
-- delete or the whole migration aborts.
DELETE FROM public.suppliers
 WHERE person_id IN (SELECT person_id FROM _p01_targets);

DELETE FROM public.persons
 WHERE id IN (SELECT person_id FROM _p01_targets);

-- Assert the intended end state inside the transaction.
DO $$
DECLARE
  _left int;
BEGIN
  SELECT count(*) INTO _left FROM public.persons p
   WHERE p.id IN ('19bb3abd-f6fb-4527-9844-09eb896f7d2d',
                  '6358926a-3938-4aca-8d7e-f7998fac233a');
  IF _left <> 0 THEN
    RAISE EXCEPTION 'P0.1 failed: % target person(s) survived the delete.', _left;
  END IF;
END $$;
