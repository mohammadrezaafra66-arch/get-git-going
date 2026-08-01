SET client_encoding='UTF8';
\pset border 2

-- =============================================================================
-- Phase 8.2 — resolving the pending merge candidate and the mobile collision
-- =============================================================================
--
-- THE ONE CASE, AND ITS CLASSIFICATION
--
--   +989122270261 is held by two persons:
--     «محمدرضا افرا»  46f4be38-4cf2-4d40-bf25-bef9454f21d9  — supplier 4ba1a0ed…, 1 purchase
--     «تست دستی من»   6358926a-3938-4aca-8d7e-f7998fac233a  — supplier 0fa0985d…, 0 references
--
--   On paper this is CLASS C: both persons own a supplier row, so person_merge's
--   guard #7 refuses the pair, and correctly so — merging two supplier files
--   blends two purchase and payment histories.
--
--   But the pair does not actually need a merge. «تست دستی من» ("my manual
--   test") is a leftover manual-test record. PROGRESS.md records it as one of
--   the two orphan suppliers the Phase 6 backfill (233) had to invent a person
--   for, and its own notes still say so. Its evidence:
--     product_suppliers 0 · purchase_prices 0 · purchases 0 · payment_vouchers 0
--     _person_merge_side reference_count = 0
--   Against «محمدرضا افرا»'s 1 purchase.
--
--   So this is CLASS B in substance: not one identity split in two, but a real
--   person and a test artifact that happen to carry the same number. The Phase 8
--   brief anticipates exactly this and prescribes the branch taken below —
--   merging test junk into a real customer's identity would pollute a real
--   person's history permanently, which is strictly worse than deleting a
--   phone number from a record that references nothing.
--
-- WHAT IS DONE
--   1. Remove the mobile identifier from the TEST record only. The real
--      person keeps the number. This clears the 8.4 collision.
--   2. Dismiss the candidate through person_merge_dismiss (not a raw UPDATE),
--      so the resolution is attributed to a reviewer like any other.
--
-- WHAT IS DELIBERATELY NOT DONE
--   The «تست دستی من» person and its supplier row are left in place. Deleting
--   business rows is out of scope for an identity phase, and the row is
--   harmless: it has no transactions and, after this script, no identifier that
--   can collide with anything. It is reported to the owner as cleanup.
-- -----------------------------------------------------------------------------

\echo '===== BEFORE: mobile collisions ====='
SELECT i.value_normalized, COUNT(DISTINCT i.person_id) persons,
       array_agg(DISTINCT p.display_name) names
FROM public.person_identifiers i
JOIN public.persons p ON p.id = i.person_id
WHERE i.kind IN ('mobile_e164','landline','email')
GROUP BY i.value_normalized HAVING COUNT(DISTINCT i.person_id) > 1;

\echo '===== BEFORE: pending candidates ====='
SELECT id, person_id_a, person_id_b, status FROM public.person_merge_candidates WHERE status='pending';

\echo '===== BEFORE: counts ====='
SELECT (SELECT COUNT(*) FROM public.persons) persons,
       (SELECT COUNT(*) FROM public.persons WHERE is_active) active,
       (SELECT COUNT(*) FROM public.person_identifiers) identifiers;

-- -----------------------------------------------------------------------------
-- Guard: refuse to run if the test record has acquired any reference since the
-- classification above was made. If it has, it is no longer disposable and this
-- script must not run.
-- -----------------------------------------------------------------------------
DO $guard$
DECLARE _refs bigint;
BEGIN
  SELECT (SELECT COUNT(*) FROM public.product_suppliers  WHERE supplier_id      = '0fa0985d-aca3-4735-8739-13fc29b1e802')
       + (SELECT COUNT(*) FROM public.purchase_prices    WHERE supplier_id      = '0fa0985d-aca3-4735-8739-13fc29b1e802')
       + (SELECT COUNT(*) FROM public.purchases          WHERE supplier_id      = '0fa0985d-aca3-4735-8739-13fc29b1e802')
       + (SELECT COUNT(*) FROM public.payment_vouchers   WHERE payee_supplier_id= '0fa0985d-aca3-4735-8739-13fc29b1e802')
    INTO _refs;

  IF _refs > 0 THEN
    RAISE EXCEPTION
      'رکورد آزمایشی «تست دستی من» اکنون % ارجاع دارد و دیگر قابل حذف نیست. این اسکریپت اجرا نشد.', _refs;
  END IF;
  RAISE NOTICE 'Guard passed: test record has 0 business references.';
END $guard$;

-- -----------------------------------------------------------------------------
-- 1. Remove the mobile identifier from the TEST record only.
-- -----------------------------------------------------------------------------
DELETE FROM public.person_identifiers
WHERE person_id = '6358926a-3938-4aca-8d7e-f7998fac233a'
  AND kind = 'mobile_e164'
  AND value_normalized = '+989122270261';

-- -----------------------------------------------------------------------------
-- 2. Dismiss the candidate through the real RPC, as a real admin.
-- -----------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';
SET LOCAL ROLE authenticated;

SELECT public.person_merge_dismiss(
  '53311247-7ab5-485d-b32b-a1bc37348d0b'::uuid,
  'رکورد آزمایشی «تست دستی من» است و شخص واقعی نیست؛ شمارهٔ مشترک از رکورد آزمایشی حذف شد. ادغام انجام نشد تا سابقهٔ شخص واقعی آلوده نشود.'
) AS dismiss_result;

RESET ROLE;

-- -----------------------------------------------------------------------------
-- 3. HARD GATE verification.
-- -----------------------------------------------------------------------------
\echo '===== AFTER: mobile collisions (MUST be 0 rows) ====='
SELECT i.value_normalized, COUNT(DISTINCT i.person_id) persons
FROM public.person_identifiers i
WHERE i.kind IN ('mobile_e164','landline','email')
GROUP BY i.value_normalized HAVING COUNT(DISTINCT i.person_id) > 1;

\echo '===== AFTER: customers duplicate person_id (MUST be 0 rows) ====='
SELECT person_id, COUNT(*) FROM public.customers GROUP BY person_id HAVING COUNT(*) > 1;

\echo '===== AFTER: suppliers duplicate person_id (MUST be 0 rows) ====='
SELECT person_id, COUNT(*) FROM public.suppliers GROUP BY person_id HAVING COUNT(*) > 1;

\echo '===== AFTER: pending candidates (MUST be 0 rows) ====='
SELECT id, status FROM public.person_merge_candidates WHERE status='pending';

\echo '===== AFTER: candidate final state ====='
SELECT id, status, reviewed_by IS NOT NULL AS has_reviewer, left(detail, 80) AS detail
FROM public.person_merge_candidates;

\echo '===== AFTER: counts (persons must be unchanged) ====='
SELECT (SELECT COUNT(*) FROM public.persons) persons,
       (SELECT COUNT(*) FROM public.persons WHERE is_active) active,
       (SELECT COUNT(*) FROM public.person_identifiers) identifiers;

\echo '===== AFTER: the real person still holds the number ====='
SELECT p.display_name, i.value_raw, i.value_normalized, i.status
FROM public.person_identifiers i JOIN public.persons p ON p.id=i.person_id
WHERE i.value_normalized = '+989122270261';

\echo '===== AFTER: drift report (MUST be empty) ====='
SELECT * FROM public.person_fk_drift_report();

-- -----------------------------------------------------------------------------
-- 4. Fail loudly if any gate is still violated.
-- -----------------------------------------------------------------------------
DO $gate$
DECLARE _coll int; _dupc int; _dups int; _pend int;
BEGIN
  SELECT COUNT(*) INTO _coll FROM (
    SELECT 1 FROM public.person_identifiers
    WHERE kind IN ('mobile_e164','landline','email')
    GROUP BY kind, value_normalized HAVING COUNT(DISTINCT person_id) > 1) x;
  SELECT COUNT(*) INTO _dupc FROM (
    SELECT 1 FROM public.customers GROUP BY person_id HAVING COUNT(*) > 1) x;
  SELECT COUNT(*) INTO _dups FROM (
    SELECT 1 FROM public.suppliers GROUP BY person_id HAVING COUNT(*) > 1) x;
  SELECT COUNT(*) INTO _pend FROM public.person_merge_candidates WHERE status='pending';

  IF _coll > 0 OR _dupc > 0 OR _dups > 0 OR _pend > 0 THEN
    RAISE EXCEPTION 'HARD GATE FAILED: collisions=% dup_customers=% dup_suppliers=% pending=%',
      _coll, _dupc, _dups, _pend;
  END IF;
  RAISE NOTICE 'HARD GATE PASSED: collisions=0 dup_customers=0 dup_suppliers=0 pending=0';
END $gate$;
