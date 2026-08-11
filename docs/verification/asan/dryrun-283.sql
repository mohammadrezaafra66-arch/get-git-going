SET client_encoding='UTF8';
BEGIN;
\i /tmp/mig283.sql

SELECT 'person_codes' AS check, count(*) AS n FROM public.person_identifiers WHERE kind='asan_person_code';
SELECT 'product_codes' AS check, count(*) AS n FROM public.products WHERE accounting_code IS NOT NULL;

-- the partial index must reject a duplicate non-null code ...
SAVEPOINT s1;
DO $$
BEGIN
  UPDATE public.products SET accounting_code = '7009'
   WHERE sku = 'AFK-2026-00003';
  RAISE EXCEPTION 'FAIL: duplicate product accounting_code was accepted';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'PASS: duplicate product accounting_code rejected';
END $$;
ROLLBACK TO SAVEPOINT s1;

-- ... but must allow many NULLs
SELECT 'products_with_null_code' AS check, count(*) AS n FROM public.products WHERE accounting_code IS NULL;

-- duplicate Asan person code must be rejected too
SAVEPOINT s2;
DO $$
DECLARE v text; p uuid;
BEGIN
  SELECT value_normalized INTO v FROM public.person_identifiers WHERE kind='asan_person_code' LIMIT 1;
  SELECT id INTO p FROM public.persons
   WHERE id NOT IN (SELECT person_id FROM public.person_identifiers WHERE kind='asan_person_code')
   LIMIT 1;
  INSERT INTO public.person_identifiers(person_id, kind, value_raw, value_normalized, status, is_primary)
  VALUES (p, 'asan_person_code', v, v, 'provisional', false);
  RAISE EXCEPTION 'FAIL: duplicate asan_person_code was accepted';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'PASS: duplicate asan_person_code rejected';
END $$;
ROLLBACK TO SAVEPOINT s2;

-- An unknown kind must still be rejected. Note WHICH gate fires: trg_person_identifiers_normalize
-- runs BEFORE INSERT and calls normalize_identifier(), whose ELSE branch raises 22023
-- (invalid_parameter_value) — so the row never reaches the CHECK constraint. Asserting
-- check_violation here would fail for the right reason, which is worse than not asserting.
SAVEPOINT s3;
DO $$
DECLARE p uuid;
BEGIN
  SELECT id INTO p FROM public.persons LIMIT 1;
  INSERT INTO public.person_identifiers(person_id, kind, value_raw, value_normalized, status, is_primary)
  VALUES (p, 'not_a_real_kind', 'x', 'x', 'provisional', false);
  RAISE EXCEPTION 'FAIL: an unknown identifier kind was accepted';
EXCEPTION WHEN invalid_parameter_value OR check_violation THEN
  RAISE NOTICE 'PASS: unknown identifier kind still rejected';
END $$;
ROLLBACK TO SAVEPOINT s3;

-- The new kind must round-trip through the normalizer: Persian digits and stray spaces in,
-- canonical Latin digits out.
SAVEPOINT s4;
DO $$
DECLARE p uuid; got text;
BEGIN
  SELECT id INTO p FROM public.persons
   WHERE id NOT IN (SELECT person_id FROM public.person_identifiers WHERE kind='asan_person_code')
   LIMIT 1;
  INSERT INTO public.person_identifiers(person_id, kind, value_raw, value_normalized, status, is_primary)
  VALUES (p, 'asan_person_code', ' ۶۰۱۵۰۶ ', 'ignored', 'provisional', false);
  SELECT value_normalized INTO got FROM public.person_identifiers
   WHERE person_id = p AND kind='asan_person_code';
  IF got <> '601506' THEN
    RAISE EXCEPTION 'FAIL: Persian-digit Asan code normalised to % instead of 601506', got;
  END IF;
  RAISE NOTICE 'PASS: Persian digits normalised to %', got;
END $$;
ROLLBACK TO SAVEPOINT s4;

ROLLBACK;
