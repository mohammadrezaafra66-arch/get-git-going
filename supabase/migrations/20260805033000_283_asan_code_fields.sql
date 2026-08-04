-- 283: persistent Asan code fields for person, product, bank account and external party.
--
-- Grounded in docs/asan/research-asan-bridge.md:
--   R1.3 products.easy_code DOES NOT EXIST anywhere in the schema, so there is nothing to
--        extend -- a new column is added, named accounting_code to match the name already
--        used on customers, external_parties and bank_accounts.
--   R2.2 the Asan person code is a property of the PERSON, not of the customer/supplier role,
--        so it belongs in person_identifiers as a new kind rather than on customers.
--        customers.accounting_code stays as a legacy mirror and is the backfill source.
--   R5.2 external_parties.accounting_code ALREADY EXISTS with a unique constraint -- nothing
--        to add there, which is why this migration only touches three of the four entities.
--
-- Every new code column is nullable: an entity without an Asan code is a normal state. Only
-- export enforces the requirement (M4).
--
-- Rollback: docs/verification/283-down.sql
SET client_encoding='UTF8';

-- ---------------------------------------------------------------- product ----
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS accounting_code text;

COMMENT ON COLUMN public.products.accounting_code IS
  'Asan product code (کد کالا). Nullable: most products have none. R1.5 measured only 3 of 355 '
  'as safely matchable, and Asan mints codes for unknown items under group 101.';

-- Partial: many rows will legitimately be NULL, and two products must not claim one code.
CREATE UNIQUE INDEX IF NOT EXISTS products_accounting_code_unique_idx
  ON public.products (accounting_code)
  WHERE accounting_code IS NOT NULL;

-- ------------------------------------------------------------ bank account ----
-- The column already exists but carried NO uniqueness at all (only the pkey), so two bank
-- accounts could claim the same Asan code. Partial, to match customers' existing index.
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_accounting_code_unique_idx
  ON public.bank_accounts (accounting_code)
  WHERE accounting_code IS NOT NULL;

-- ----------------------------------------------------------------- person ----
-- Extend the kind CHECK. Rebuilt from the live definition read immediately before writing
-- this migration; only 'asan_person_code' is added, the other eight are byte-identical.
ALTER TABLE public.person_identifiers DROP CONSTRAINT IF EXISTS person_identifiers_kind_check;
ALTER TABLE public.person_identifiers ADD CONSTRAINT person_identifiers_kind_check
  CHECK (kind = ANY (ARRAY[
    'mobile_e164'::text,
    'landline'::text,
    'national_id_ir'::text,
    'tax_id_ir'::text,
    'company_reg_id_ir'::text,
    'email'::text,
    'iban'::text,
    'custom'::text,
    'asan_person_code'::text
  ]));

-- Mirrors uq_person_identifiers_strong_active: one Asan code cannot belong to two people.
-- Revoked rows are excluded so a corrected code can be superseded rather than blocked.
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_asan_code_active
  ON public.person_identifiers (kind, value_normalized)
  WHERE status <> 'revoked' AND kind = 'asan_person_code';

-- The CHECK is not the only gate: trg_person_identifiers_normalize calls
-- normalize_identifier(), whose ELSE branch rejects any kind it does not know. Without this
-- the backfill below fails with 'نوع شناسه پشتیبانی نمی‌شود'. Rebuilt from the live
-- pg_get_functiondef output snapshotted in docs/verification/pre-283/, with one branch added
-- and nothing else touched (rule 2.3).
CREATE OR REPLACE FUNCTION public.normalize_identifier(_kind text, _raw text, _strict boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  _t      text;
  _d      text;
  _v      text;
  _core   text;
  _sum    int := 0;
  _rem    int;
  _chk    int;
  _i      int;
  _ch     text;
  _acc    text := '';
  _part   text;
BEGIN
  IF _raw IS NULL THEN
    IF _strict THEN RAISE EXCEPTION 'مقدار شناسه نامعتبر است' USING ERRCODE='22023'; END IF;
    RETURN NULL;
  END IF;

  -- toAsciiDigits() then trim — applied to every kind, exactly as the TS does.
  _t := btrim(translate(_raw,
          '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩',
          '01234567890123456789'));

  IF length(_t) = 0 THEN
    IF _strict THEN RAISE EXCEPTION 'مقدار شناسه نمی‌تواند خالی باشد' USING ERRCODE='22023'; END IF;
    RETURN NULL;
  END IF;

  -- digitsOnly()
  _d := regexp_replace(_t, '[^0-9]', '', 'g');

  ---------------------------------------------------------------------------
  IF _kind = 'mobile_e164' THEN
    IF    _d ~ '^00989[0-9]{9}$' THEN _core := substr(_d, 5);
    ELSIF _d ~ '^989[0-9]{9}$'   THEN _core := substr(_d, 3);
    ELSIF _d ~ '^09[0-9]{9}$'    THEN _core := substr(_d, 2);
    ELSIF _d ~ '^9[0-9]{9}$'     THEN _core := _d;
    ELSE
      IF _strict THEN
        RAISE EXCEPTION 'شماره موبایل ایران معتبر نیست (مثال: 09121234567)' USING ERRCODE='22023';
      END IF;
      RETURN NULL;
    END IF;
    RETURN '+98' || _core;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'landline' THEN
    IF    _d ~ '^0098[0-9]{8,12}$' THEN _d := '0' || substr(_d, 5);
    ELSIF _d ~ '^98[0-9]{8,12}$'   THEN _d := '0' || substr(_d, 3);
    END IF;
    IF _d !~ '^0[0-9]{9,11}$' THEN
      IF _strict THEN RAISE EXCEPTION 'شماره ثابت معتبر نیست' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _d;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'national_id_ir' THEN
    _d := lpad(_d, 10, '0');
    IF _d !~ '^[0-9]{10}$' THEN
      IF _strict THEN RAISE EXCEPTION 'کد ملی باید ۱۰ رقم باشد' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    -- all-identical digits are structurally invalid
    IF _d ~ '^([0-9])\1{9}$' THEN
      IF _strict THEN RAISE EXCEPTION 'کد ملی معتبر نیست' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    _sum := 0;
    FOR _i IN 1..9 LOOP
      _sum := _sum + substr(_d, _i, 1)::int * (11 - _i);
    END LOOP;
    _rem := _sum % 11;
    _chk := substr(_d, 10, 1)::int;
    IF NOT ((_rem < 2 AND _chk = _rem) OR (_rem >= 2 AND _chk = 11 - _rem)) THEN
      IF _strict THEN RAISE EXCEPTION 'کد ملی معتبر نیست' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _d;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'tax_id_ir' THEN
    IF _d !~ '^[0-9]{10,12}$' THEN
      IF _strict THEN RAISE EXCEPTION 'شناسه مالیاتی نامعتبر است' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _d;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'company_reg_id_ir' THEN
    IF _d !~ '^[0-9]{3,15}$' THEN
      IF _strict THEN RAISE EXCEPTION 'شماره ثبت شرکت نامعتبر است' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _d;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'email' THEN
    _v := lower(_t);
    IF _v !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(_v) > 254 THEN
      IF _strict THEN RAISE EXCEPTION 'ایمیل معتبر نیست' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _v;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'iban' THEN
    _v := regexp_replace(upper(_t), '[[:space:]]', '', 'g');
    IF _v ~ '^[0-9]{24}$' THEN _v := 'IR' || _v; END IF;
    IF _v !~ '^IR[0-9]{24}$' THEN
      IF _strict THEN
        RAISE EXCEPTION 'شماره شبا باید با IR شروع و ۲۴ رقم داشته باشد' USING ERRCODE='22023';
      END IF;
      RETURN NULL;
    END IF;
    -- mod-97 checksum: move first 4 chars to the end, letters -> A=10..Z=35
    _part := substr(_v, 5) || substr(_v, 1, 4);
    _acc := '';
    FOR _i IN 1..length(_part) LOOP
      _ch := substr(_part, _i, 1);
      IF _ch ~ '^[0-9]$' THEN
        _acc := _acc || _ch;
      ELSE
        _acc := _acc || (ascii(_ch) - 55)::text;
      END IF;
    END LOOP;
    _rem := 0;
    _i := 1;
    WHILE _i <= length(_acc) LOOP
      _rem := (_rem::text || substr(_acc, _i, 7))::bigint % 97;
      _i := _i + 7;
    END LOOP;
    IF _rem <> 1 THEN
      IF _strict THEN RAISE EXCEPTION 'چک‌سام شماره شبا معتبر نیست' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _v;

  ---------------------------------------------------------------------------
  ELSIF _kind = 'custom' THEN
    _v := btrim(regexp_replace(_t, '[[:space:]]+', ' ', 'g'));
    IF length(_v) = 0 THEN
      IF _strict THEN RAISE EXCEPTION 'مقدار شناسه نمی‌تواند خالی باشد' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    IF length(_v) > 255 THEN
      IF _strict THEN RAISE EXCEPTION 'طول شناسه بیش از حد مجاز است' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _v;

  ---------------------------------------------------------------------------
  -- Asan person code (کد حساب). Migration 283. Digits only: every one of the 488 codes in
  -- docs/asan/reference/اشخاص.xlsx is numeric, 3-7 digits, range 127-1739003 (research R5.3).
  -- _t has already had Persian/Arabic-Indic digits folded to ASCII and been trimmed above,
  -- so a paste from the Asan UI normalises correctly without extra handling here.
  ELSIF _kind = 'asan_person_code' THEN
    _v := regexp_replace(_t, '[[:space:]]+', '', 'g');
    IF _v !~ '^[0-9]+$' THEN
      IF _strict THEN RAISE EXCEPTION 'کد حساب آسان باید فقط رقم باشد' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    -- Leading zeros are stripped so '0102012' and '102012' cannot become two codes for two
    -- different people; ltrim of an all-zero value would empty it, hence the guard.
    _v := ltrim(_v, '0');
    IF length(_v) = 0 THEN
      IF _strict THEN RAISE EXCEPTION 'کد حساب آسان نامعتبر است' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    IF length(_v) > 20 THEN
      IF _strict THEN RAISE EXCEPTION 'طول کد حساب آسان بیش از حد مجاز است' USING ERRCODE='22023'; END IF;
      RETURN NULL;
    END IF;
    RETURN _v;

  ---------------------------------------------------------------------------
  ELSE
    IF _strict THEN RAISE EXCEPTION 'نوع شناسه پشتیبانی نمی‌شود' USING ERRCODE='22023'; END IF;
    RETURN NULL;
  END IF;
END;
$function$;

-- ---------------------------------------------------------------- backfill ----
-- Persons: from customers.accounting_code, which R2.1 confirmed IS the Asan person code
-- (cross-validated by an independent mobile match). Status 'provisional', deliberately:
-- 6 of the 11 do not appear in docs/asan/reference/اشخاص.xlsx, and the import in phase 3.3
-- is what promotes a code to 'confirmed'. Guarded so re-running changes nothing.
INSERT INTO public.person_identifiers (person_id, kind, value_raw, value_normalized, status, is_primary)
SELECT c.person_id,
       'asan_person_code',
       btrim(c.accounting_code),
       btrim(c.accounting_code),
       'provisional',
       false
  FROM public.customers c
 WHERE c.person_id IS NOT NULL
   AND coalesce(btrim(c.accounting_code), '') <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.person_identifiers pi
      WHERE pi.person_id = c.person_id AND pi.kind = 'asan_person_code')
   AND NOT EXISTS (
     SELECT 1 FROM public.person_identifiers pi
      WHERE pi.kind = 'asan_person_code'
        AND pi.value_normalized = btrim(c.accounting_code)
        AND pi.status <> 'revoked');

-- Products: the three matches R1.5 could defend. Every one is an exact match after
-- whitespace/case normalisation and is unique on BOTH sides, so none is ambiguous.
-- Barcode backfill is deliberately absent: barcode is 0% populated on both sides (R1.5),
-- so there is nothing to match on, not merely nothing found.
UPDATE public.products SET accounting_code = v.asan_code
  FROM (VALUES
    ('AFK-2026-00039', '7009'),
    ('AFK-2026-00178', '7243'),
    ('AFK-2026-00179', '7272')
  ) AS v(sku, asan_code)
 WHERE public.products.sku = v.sku
   AND public.products.accounting_code IS NULL;

DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='products' AND column_name='accounting_code'
     AND is_nullable='YES';
  IF n <> 1 THEN RAISE EXCEPTION 'products.accounting_code missing or not nullable'; END IF;

  SELECT count(*) INTO n FROM pg_indexes WHERE schemaname='public' AND indexname IN
    ('products_accounting_code_unique_idx','bank_accounts_accounting_code_unique_idx',
     'uq_person_identifiers_asan_code_active');
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 new partial unique indexes, found %', n; END IF;

  SELECT count(*) INTO n FROM public.person_identifiers WHERE kind='asan_person_code';
  IF n <> 11 THEN RAISE EXCEPTION 'expected 11 backfilled person codes, found %', n; END IF;

  SELECT count(*) INTO n FROM public.products WHERE accounting_code IS NOT NULL;
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 backfilled product codes, found %', n; END IF;
END
$chk$;
