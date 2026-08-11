SET client_encoding='UTF8';

-- =============================================================================
-- 228 — Phase 2: Person Aliases + Identifier Normalization + Uniqueness Split
-- =============================================================================
--
-- Filename note: the requested name was `20260731_phase2_person_aliases.sql`.
-- Renamed to the repo convention `2026MMDD<HHMMSS>_<NNN>_<name>.sql` (rule 6)
-- so it keeps its place in the numbered series after 227.
--
-- CONTENTS
--   1. normalize_identifier()            — plpgsql, Iranian rules (NEW)
--   2. BEFORE trigger on person_identifiers — DB becomes the single authority
--   3. Uniqueness split (blocker B3)     — strong IDs global, phone/email on confirm
--   4. person_aliases                    — alternate names, ZWNJ-insensitive matching
--   5. person_field_definitions          — B4 documentation + default assertion
--
-- -----------------------------------------------------------------------------
-- DECISION: the database is now authoritative for identifier normalization.
--
-- Migration 226 stated the opposite ("the DB does not reimplement this"). That
-- decision is hereby superseded, deliberately and with the trade-off understood:
--
--   BEFORE: TypeScript normalized, DB stored whatever it was given. Any write
--           that did not go through the app (SQL backfill, PostgREST, import,
--           psql) could store an unnormalized value, silently defeating the
--           uniqueness indexes.
--   NOW:    a BEFORE INSERT/UPDATE trigger recomputes value_normalized from
--           (kind, value_raw) on every write, whatever the path. TypeScript
--           normalizeIdentifier() remains for instant client-side feedback but
--           is no longer authoritative — if the two ever disagree, the DB wins
--           and the stored value is the DB's.
--
-- This is what makes the Phase 5 backfill (customers.phone -> person_identifiers)
-- possible in plain SQL inside one transaction.
--
-- The rules below are a direct port of src/lib/persons/identifiers-normalize.ts.
-- If you change one, change the other. The verification script asserts they
-- agree on a fixed sample set.
-- -----------------------------------------------------------------------------


-- =============================================================================
-- 1. normalize_identifier(kind, raw, strict)
-- =============================================================================
DROP FUNCTION IF EXISTS public.normalize_identifier(text, text, boolean);

CREATE FUNCTION public.normalize_identifier(
  _kind   text,
  _raw    text,
  _strict boolean DEFAULT true
)
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
  ELSE
    IF _strict THEN RAISE EXCEPTION 'نوع شناسه پشتیبانی نمی‌شود' USING ERRCODE='22023'; END IF;
    RETURN NULL;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.normalize_identifier(text, text, boolean) IS
'Authoritative identifier normalization (item 228). Port of '
'src/lib/persons/identifiers-normalize.ts — keep the two in sync. _strict=false '
'returns NULL instead of raising, for search/dedup probing.';


-- =============================================================================
-- 2. BEFORE trigger — every write path gets normalized, not just the app
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_person_identifiers_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.value_normalized := public.normalize_identifier(NEW.kind, NEW.value_raw, true);
  RETURN NEW;
END;
$function$;

-- Fires before trg_person_identifiers_validate ('n' < 'v' — same-timing triggers
-- run in name order), so validation sees the normalized value.
DROP TRIGGER IF EXISTS trg_person_identifiers_normalize ON public.person_identifiers;
CREATE TRIGGER trg_person_identifiers_normalize
  BEFORE INSERT OR UPDATE OF kind, value_raw
  ON public.person_identifiers
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_person_identifiers_normalize();


-- =============================================================================
-- 3. Uniqueness split — blocker B3
--
-- BEFORE: uq_person_identifiers_active_kind_value made (kind, value_normalized)
--         globally unique for ANY kind while status IN (provisional, confirmed).
--         Consequences: two family members could not both register the same
--         shared landline, and a mistyped provisional phone permanently blocked
--         its real owner until an admin revoked it.
--
-- AFTER:  strong government identifiers stay globally unique even while
--         provisional (a national ID genuinely identifies one person);
--         phone / email / custom become unique only once CONFIRMED, via the
--         pre-existing uq_person_identifiers_confirmed_kind_value index.
-- =============================================================================
DROP INDEX IF EXISTS public.uq_person_identifiers_active_kind_value;

CREATE UNIQUE INDEX uq_person_identifiers_strong_active
  ON public.person_identifiers (kind, value_normalized)
  WHERE status IN ('provisional', 'confirmed')
    AND kind IN ('national_id_ir', 'tax_id_ir', 'company_reg_id_ir', 'iban');

COMMENT ON INDEX public.uq_person_identifiers_strong_active IS
'Government-issued identifiers are unique even while provisional. Weak '
'identifiers (mobile/landline/email/custom) are only unique once confirmed — '
'see uq_person_identifiers_confirmed_kind_value.';


-- =============================================================================
-- 4. person_aliases
--
-- Alternate names for the SAME person: trade names, former names, misspellings,
-- transliterations. Matching is ZWNJ- and spacing-insensitive via
-- normalize_fa_text(), which already exists and is IMMUTABLE.
--
--   normalize_fa_text('سحر شاهمرادی') = normalize_fa_text('سحر شاه‌مرادی')  -> true
--
-- NOTE: normalize_fa() (the similarly named function) does NOT work here — it
-- converts ZWNJ to a space, so 'شاه مرادی' <> 'شاهمرادی'. Verified empirically.
--
-- alias_normalized is deliberately NOT globally unique: two different people
-- legitimately share a name. It is a matching aid, never an identity claim.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.person_aliases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  alias            text NOT NULL,
  alias_normalized text GENERATED ALWAYS AS (public.normalize_fa_text(alias)) STORED,
  alias_kind       text NOT NULL DEFAULT 'other',
  source           text,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_aliases_alias_not_blank CHECK (length(btrim(alias)) > 0),
  CONSTRAINT person_aliases_kind_check CHECK (
    alias_kind IN ('legal','trade','former','nickname','transliteration','misspelling','other')
  )
);

-- Same alias twice on one person is meaningless; across persons it is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_aliases_person_normalized
  ON public.person_aliases (person_id, alias_normalized);

CREATE INDEX IF NOT EXISTS idx_person_aliases_person_id
  ON public.person_aliases (person_id);

CREATE INDEX IF NOT EXISTS idx_person_aliases_normalized
  ON public.person_aliases (alias_normalized);

-- Fuzzy candidate search for the duplicate-detection UI (pg_trgm 1.6 present).
CREATE INDEX IF NOT EXISTS idx_person_aliases_normalized_trgm
  ON public.person_aliases USING gin (alias_normalized gin_trgm_ops);

-- Match a typed name against canonical display names too, not only aliases.
CREATE INDEX IF NOT EXISTS idx_persons_display_name_normalized
  ON public.persons (public.normalize_fa_text(display_name));

CREATE INDEX IF NOT EXISTS idx_persons_display_name_trgm
  ON public.persons USING gin (public.normalize_fa_text(display_name) gin_trgm_ops);

COMMENT ON TABLE public.person_aliases IS
'Alternate names for a person (item 228). alias_normalized is generated via '
'normalize_fa_text() and is NOT globally unique — distinct people may share a '
'name. Used for duplicate detection and search, never for authorization.';

-- --- updated_at + audit ------------------------------------------------------
DROP TRIGGER IF EXISTS trg_person_aliases_set_updated_at ON public.person_aliases;
CREATE TRIGGER trg_person_aliases_set_updated_at
  BEFORE UPDATE ON public.person_aliases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.audit_person_aliases()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (action, entity_type, entity_id, actor_id, diff)
  VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'person_alias.create' ELSE 'person_alias.update' END,
    'person_alias', NEW.id::text, auth.uid(),
    jsonb_build_object(
      'person_id', NEW.person_id,
      'alias', NEW.alias,
      'alias_normalized', NEW.alias_normalized,
      'alias_kind', NEW.alias_kind
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_person_aliases_audit ON public.person_aliases;
CREATE TRIGGER trg_person_aliases_audit
  AFTER INSERT OR UPDATE ON public.person_aliases
  FOR EACH ROW EXECUTE FUNCTION public.audit_person_aliases();

-- --- RLS: mirrors person_identifiers exactly --------------------------------
ALTER TABLE public.person_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS person_aliases_select_via_person ON public.person_aliases;
CREATE POLICY person_aliases_select_via_person
  ON public.person_aliases
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.persons p WHERE p.id = person_id));

DROP POLICY IF EXISTS person_aliases_insert_identity_authors ON public.person_aliases;
CREATE POLICY person_aliases_insert_identity_authors
  ON public.person_aliases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin', 'manager', 'sales', 'accountant'])
    AND EXISTS (SELECT 1 FROM public.persons p WHERE p.id = person_id)
  );

DROP POLICY IF EXISTS person_aliases_update_admin_manager ON public.person_aliases;
CREATE POLICY person_aliases_update_admin_manager
  ON public.person_aliases
  FOR UPDATE
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin', 'manager']))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin', 'manager']));

REVOKE ALL ON public.person_aliases FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.person_aliases TO authenticated;


-- =============================================================================
-- 5. person_field_definitions — blocker B4
--
-- No schema change: is_required already DEFAULTs to false (verified before
-- writing this migration). What was missing is that nothing told an operator
-- that flipping this flag silently reimposes a mandatory precondition on
-- person creation — the exact gate this whole project exists to remove.
-- =============================================================================
DO $$
BEGIN
  IF (SELECT column_default FROM information_schema.columns
       WHERE table_schema='public' AND table_name='person_field_definitions'
         AND column_name='is_required') IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'B4 assertion failed: person_field_definitions.is_required default is not false';
  END IF;
END $$;

COMMENT ON COLUMN public.person_field_definitions.is_required IS
'DANGER — re-gating vector. Setting this true makes person creation FAIL for '
'anyone who cannot supply the field, including inline creation from purchase '
'and sales forms. That reintroduces the mandatory precondition the unified-'
'person model exists to remove. Default is false and should stay false unless '
'the business owner has explicitly accepted that creation may be blocked.';

COMMENT ON TABLE public.person_field_definitions IS
'Admin-defined extra fields for persons. See the warning on is_required before '
'marking any field mandatory.';


-- =============================================================================
-- 6. person_create_full — stop requiring a caller-supplied value_normalized
--
-- 226 rejected any identifier whose value_normalized was blank, because back
-- then the caller was the only thing that could compute it. Section 2 above
-- moved that responsibility into a BEFORE trigger, so demanding it from the
-- caller is now both redundant and wrong: it blocks every non-TypeScript write
-- path (SQL backfill, import, psql) from using the RPC at all.
--
-- Same signature as 226 -> CREATE OR REPLACE, no overload is created (rule 5).
-- Only the identifier block changes; everything else is byte-identical to 226.
-- A supplied value_normalized is now accepted but IGNORED — the trigger wins.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.person_create_full(
  p_display_name      text,
  p_kind              text    DEFAULT 'individual',
  p_legal_name        text    DEFAULT NULL,
  p_visibility_scope  text    DEFAULT 'internal_general',
  p_notes             text    DEFAULT NULL,
  p_is_active         boolean DEFAULT true,
  p_identifiers       jsonb   DEFAULT '[]'::jsonb,
  p_field_values      jsonb   DEFAULT '[]'::jsonb,
  p_context_kind      text    DEFAULT NULL,
  p_context_ref_table text    DEFAULT NULL,
  p_context_ref_id    uuid    DEFAULT NULL,
  p_context_note      text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid           uuid := auth.uid();
  _person_id     uuid;
  _idf           jsonb;
  _fv            jsonb;
  _missing       text;
  _ident_count   int := 0;
  _fv_count      int := 0;
  _link_id       uuid;
  _kind          text;
  _raw           text;
  _status        text;
  _primary       boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF p_display_name IS NULL OR btrim(p_display_name) = '' THEN
    RAISE EXCEPTION 'نام نمایشی نمی‌تواند خالی باشد.' USING ERRCODE = '22023';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('individual', 'organization') THEN
    RAISE EXCEPTION 'نوع شخص نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  IF p_visibility_scope IS NULL
     OR p_visibility_scope NOT IN ('internal_general', 'restricted_finance', 'restricted_executive') THEN
    RAISE EXCEPTION 'سطح دسترسی شخص نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  IF p_identifiers IS NULL OR jsonb_typeof(p_identifiers) <> 'array' THEN
    RAISE EXCEPTION 'فهرست شناسه‌ها باید یک آرایه باشد.' USING ERRCODE = '22023';
  END IF;

  IF p_field_values IS NULL OR jsonb_typeof(p_field_values) <> 'array' THEN
    RAISE EXCEPTION 'فهرست فیلدها باید یک آرایه باشد.' USING ERRCODE = '22023';
  END IF;

  IF p_context_kind IS NOT NULL
     AND ((p_context_ref_table IS NULL) <> (p_context_ref_id IS NULL)) THEN
    RAISE EXCEPTION 'ارجاع زمینه باید هم جدول و هم شناسه داشته باشد یا هیچ‌کدام.'
      USING ERRCODE = '22023';
  END IF;

  SELECT string_agg(d.label, '، ' ORDER BY d.sort_order, d.label)
    INTO _missing
  FROM public.person_field_definitions d
  WHERE d.is_active = true
    AND d.is_required = true
    AND d.applies_to_kind IN (p_kind, 'both')
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_field_values) AS e
      WHERE (e->>'field_definition_id') IS NOT NULL
        AND (e->>'field_definition_id')::uuid = d.id
        AND e->'value' IS NOT NULL
        AND CASE jsonb_typeof(e->'value')
              WHEN 'null'   THEN false
              WHEN 'string' THEN btrim(e->>'value') <> ''
              WHEN 'array'  THEN jsonb_array_length(e->'value') > 0
              WHEN 'object' THEN (SELECT count(*) FROM jsonb_object_keys(e->'value')) > 0
              ELSE true
            END
    );

  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'فیلدهای الزامی تکمیل نشده: %', _missing USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.persons (
    kind, display_name, legal_name, visibility_scope, is_active, notes, created_by
  )
  VALUES (
    p_kind,
    btrim(p_display_name),
    NULLIF(btrim(COALESCE(p_legal_name, '')), ''),
    p_visibility_scope,
    COALESCE(p_is_active, true),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    _uid
  )
  RETURNING id INTO _person_id;

  IF _person_id IS NULL THEN
    RAISE EXCEPTION 'ایجاد شخص ناموفق بود.' USING ERRCODE = 'P0001';
  END IF;

  ---------------------------------------------------------------------------
  -- person_identifiers — value_normalized is computed by
  -- trg_person_identifiers_normalize, NOT supplied by the caller.
  ---------------------------------------------------------------------------
  FOR _idf IN SELECT * FROM jsonb_array_elements(p_identifiers)
  LOOP
    _kind    := _idf->>'kind';
    _raw     := _idf->>'value_raw';
    _status  := COALESCE(_idf->>'status', 'provisional');
    _primary := COALESCE((_idf->>'is_primary')::boolean, false);

    IF _kind IS NULL OR btrim(COALESCE(_raw, '')) = '' THEN
      RAISE EXCEPTION 'شناسه نامعتبر است — نوع و مقدار الزامی است.' USING ERRCODE = '22023';
    END IF;

    BEGIN
      INSERT INTO public.person_identifiers (
        person_id, kind, value_raw, status, is_primary, created_by
      )
      VALUES (_person_id, _kind, _raw, _status, _primary, _uid);
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'این شناسه قبلاً در سیستم ثبت شده است: %', _raw
          USING ERRCODE = '23505';
    END;

    _ident_count := _ident_count + 1;
  END LOOP;

  FOR _fv IN SELECT * FROM jsonb_array_elements(p_field_values)
  LOOP
    IF (_fv->>'field_definition_id') IS NULL THEN
      RAISE EXCEPTION 'شناسه تعریف فیلد الزامی است.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.person_field_values (
      person_id, field_definition_id, value, updated_by
    )
    VALUES (
      _person_id,
      (_fv->>'field_definition_id')::uuid,
      _fv->'value',
      _uid
    );

    _fv_count := _fv_count + 1;
  END LOOP;

  IF p_context_kind IS NOT NULL THEN
    INSERT INTO public.person_context_links (
      person_id, context_kind, ref_table, ref_id, note, started_at, created_by
    )
    VALUES (
      _person_id,
      p_context_kind,
      p_context_ref_table,
      p_context_ref_id,
      NULLIF(btrim(COALESCE(p_context_note, '')), ''),
      now(),
      _uid
    )
    RETURNING id INTO _link_id;
  END IF;

  RETURN jsonb_build_object(
    'person_id',          _person_id,
    'identifiers_added',  _ident_count,
    'field_values_added', _fv_count,
    'context_link_id',    _link_id
  );
END;
$function$;
