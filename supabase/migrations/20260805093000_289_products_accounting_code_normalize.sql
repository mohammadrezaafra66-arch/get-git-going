-- 289: normalise products.accounting_code (the Asan کد کالا) in the database.
--
-- Owner decision, docs/execution/OWNER_ANSWERS_AND_OVERRIDES.md, section
-- "PRODUCT ASAN CODE FIELD": the Asan code becomes a first-class, human-entered field on the
-- product create and edit forms. Migration 283 already created the column and its partial
-- unique index; this migration makes the value that lands in it trustworthy.
--
-- Why a trigger and not form validation (rule 2.5): a direct PostgREST PATCH bypasses any
-- rule that lives only in the client. The unique index from 283 is on the RAW value, so
-- without normalisation '۷۰۰۹' and '7009' are two different codes for what Asan considers
-- one, and the index would happily accept both. The same is true of ' 7009' and '7009 '.
--
-- public.asan_normalize_code (migration 286) is reused rather than reimplemented: it is the
-- exact function the product importer matches with, so a hand-typed code and an imported code
-- normalise identically. It deliberately does NOT strip punctuation, so a future non-numeric
-- code such as `AFK-12` survives, and it returns NULL for an empty or whitespace-only value,
-- which is what makes "" from a cleared form field become a real NULL rather than a row that
-- claims the empty-string code.
--
-- Rollback: docs/verification/289-down.sql
SET client_encoding='UTF8';

CREATE OR REPLACE FUNCTION public.products_normalize_accounting_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  NEW.accounting_code := public.asan_normalize_code(NEW.accounting_code);
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.products_normalize_accounting_code() IS
  'ASAN M3 addendum: folds Persian digits and strips whitespace from the Asan product code, and turns an empty value into NULL, so the partial unique index from 283 means what it says.';

DROP TRIGGER IF EXISTS trg_products_normalize_accounting_code ON public.products;
CREATE TRIGGER trg_products_normalize_accounting_code
  BEFORE INSERT OR UPDATE OF accounting_code ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_normalize_accounting_code();

DO $chk$
DECLARE
  _n integer;
  _drift integer;
BEGIN
  SELECT count(*) INTO _n FROM pg_trigger
   WHERE tgrelid = 'public.products'::regclass
     AND tgname = 'trg_products_normalize_accounting_code';
  IF _n <> 1 THEN RAISE EXCEPTION 'normalise trigger not installed'; END IF;

  -- The three codes migration 283 backfilled must be untouched by normalisation. If the
  -- normaliser would rewrite an existing stored code, the next UPDATE of any product would
  -- silently change its Asan identity - the exact class of surprise this program must not
  -- create.
  SELECT count(*) INTO _drift
    FROM public.products
   WHERE accounting_code IS NOT NULL
     AND public.asan_normalize_code(accounting_code) IS DISTINCT FROM accounting_code;
  IF _drift <> 0 THEN
    RAISE EXCEPTION '% existing product code(s) would be rewritten by normalisation', _drift;
  END IF;
END
$chk$;
