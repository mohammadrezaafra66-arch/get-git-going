SET client_encoding='UTF8';

-- =============================================================================
-- 241 — Phase 8.4: one mobile = one person, globally
-- =============================================================================
--
-- DECISION 2 (owner-approved, binding)
--   A contact number identifies exactly one person, globally, whether the
--   identifier is 'provisional' or 'confirmed'.
--
-- ⚠️ THIS SUPERSEDES A PHASE 2 DESIGN DECISION — 2026-08-02.
--   Migration 228 (Phase 2, decision "B3") deliberately made mobile_e164 /
--   landline / email unique ONLY when status = 'confirmed'. Its reasoning was
--   that a typo'd or unverified number would otherwise permanently block its
--   real owner from being registered. The owner has now weighed that against
--   duplicate identities appearing in the first place and chosen strict global
--   uniqueness. The 228 trade-off is hereby reversed, knowingly.
--
--   The cost is real and should be understood: entering a number that already
--   exists now fails at the point of entry. The mitigation is the error path
--   rebuilt at the bottom of this migration — the operator is told plainly what
--   happened, and, when they are allowed to know it, who holds the number.
--
-- THE CONSTRAINTS BEFORE THIS MIGRATION (read from pg_indexes, not assumed):
--   uq_person_identifiers_confirmed_kind_value
--     UNIQUE (kind, value_normalized) WHERE status = 'confirmed'
--     -> all eight kinds, but only once confirmed. This is 228's B3 split.
--   uq_person_identifiers_strong_active
--     UNIQUE (kind, value_normalized)
--     WHERE status IN ('provisional','confirmed')
--       AND kind IN ('national_id_ir','tax_id_ir','company_reg_id_ir','iban')
--     -> the strong national identifiers, already globally unique. UNTOUCHED.
--   uq_person_identifiers_primary_active
--     UNIQUE (person_id, kind) WHERE is_primary AND status <> 'revoked'
--     -> one primary per kind per person. UNTOUCHED.
--
-- KINDS COVERED BY THE NEW RULE: mobile_e164, landline, email.
--   All three, as instructed.
--
--   ⚠️ FLAGGED FOR THE OWNER — landline is the uncomfortable one. The Phase 8
--   brief's own checkpoint 8.2 gives "two different people who share a number
--   (e.g. a landline)" as the textbook example of a pair that must NOT be
--   merged. Under this migration that situation becomes unrepresentable: two
--   colleagues on one office line can no longer both record it. Nothing breaks
--   today — there are currently 14 identifiers in the whole system and every
--   one is a mobile_e164, so there is no landline or email data to invalidate.
--   But the first shared office line will be refused. Narrowing this index to
--   ('mobile_e164','email') later is a one-line change if the owner wants it.
--
--   'custom' keeps confirmed-only uniqueness (see below).
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Belt and braces: refuse to proceed while any collision exists.
-- -----------------------------------------------------------------------------
DO $precheck$
DECLARE _n int; _detail text;
BEGIN
  SELECT COUNT(*), COALESCE(string_agg(v, ', '), '')
    INTO _n, _detail
  FROM (
    SELECT kind || '=' || value_normalized AS v
    FROM public.person_identifiers
    WHERE status <> 'revoked'
      AND kind IN ('mobile_e164','landline','email')
    GROUP BY kind, value_normalized
    HAVING COUNT(DISTINCT person_id) > 1
  ) x;

  IF _n > 0 THEN
    RAISE EXCEPTION
      'اعمال یکتایی سراسری ممکن نیست: % مقدار تماس بین بیش از یک شخص مشترک است (%). ابتدا این موارد باید در صفحهٔ «اشخاص تکراری» تعیین تکلیف شوند.',
      _n, _detail;
  END IF;

  RAISE NOTICE 'Pre-check passed: 0 contact-identifier collisions.';
END $precheck$;

-- -----------------------------------------------------------------------------
-- 2. The new global rule for contact identifiers.
--
--    "Active" means status <> 'revoked'. A revoked identifier is history, not a
--    claim on the value, so a revoked row must not block anyone — that is what
--    makes correcting a mistyped number possible at all under this regime.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_contact_global
  ON public.person_identifiers (kind, value_normalized)
  WHERE status <> 'revoked'
    AND kind IN ('mobile_e164', 'landline', 'email');

COMMENT ON INDEX public.uq_person_identifiers_contact_global IS
  'فاز ۸ (تصمیم ۲)، ۲۰۲۶-۰۸-۰۲: یک شمارهٔ تماس فقط به یک شخص تعلق دارد — چه تأییدشده و چه تأییدنشده. این قانون جایگزین تصمیم B3 در مهاجرت ۲۲۸ می‌شود که یکتایی را فقط برای شناسه‌های تأییدشده اعمال می‌کرد. شناسه‌های باطل‌شده (revoked) مانع ثبت مجدد نیستند تا اصلاح شمارهٔ اشتباه ممکن بماند.';

-- -----------------------------------------------------------------------------
-- 3. Retire 228's confirmed-only index, narrowed rather than dropped.
--
--    That index covered all eight kinds when confirmed. After step 2 the
--    coverage at status <> 'revoked' is:
--      mobile_e164 / landline / email          -> uq_..._contact_global  (new)
--      national_id_ir / tax_id_ir /
--      company_reg_id_ir / iban                -> uq_..._strong_active   (existing)
--      custom                                  -> nothing
--    So the only kind that would lose protection is 'custom'. It is preserved
--    by the narrowed index below. NO kind is weakened by this migration:
--    the three contact kinds get strictly stronger, the four strong kinds were
--    already covered more strictly, and 'custom' is unchanged.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_custom_confirmed
  ON public.person_identifiers (kind, value_normalized)
  WHERE status = 'confirmed' AND kind = 'custom';

COMMENT ON INDEX public.uq_person_identifiers_custom_confirmed IS
  'باقی‌ماندهٔ اندیس تأییدشدهٔ مهاجرت ۲۲۸ برای نوع «custom». سایر انواع در فاز ۸ به قوانین سخت‌گیرانه‌تر منتقل شدند.';

DROP INDEX IF EXISTS public.uq_person_identifiers_confirmed_kind_value;

-- -----------------------------------------------------------------------------
-- 4. The error path.
--
--    A bare 23505 naming an index is a terrible thing to show an operator who
--    just typed a phone number. validate_person_identifier is the right place
--    to fix it: it is a BEFORE INSERT OR UPDATE trigger, so it covers EVERY
--    write path at once — person_create_full, person_create_inline,
--    person_import_batch and direct PostgREST inserts from
--    PersonIdentifiersForm — rather than patching each of them.
--
--    Firing order is safe: trg_person_identifiers_normalize is also BEFORE and
--    sorts first by name, so NEW.value_normalized is already populated here.
--
--    ⚠️ DISCLOSURE, AND WHY IT IS CONDITIONAL
--      The Phase 8 brief suggests naming the owning person and linking to them.
--      Migration 226 deliberately refused to do that, with an explicit comment:
--      naming the owner "would leak the existence of a person the caller may
--      not be allowed to see". Both concerns are legitimate and they are
--      reconciled rather than one overriding the other: the owner is named only
--      when the caller's roles already satisfy that person's visibility_scope —
--      i.e. only when the caller could have found them by searching anyway.
--      Everyone else gets the generic message. No caller learns anything the
--      persons SELECT policy would not already have told them.
--
--    SECURITY DEFINER is required, not cosmetic: the conflict lookup must
--    always FIND the clashing row in order to raise a good error. Under invoker
--    rights the SELECT would return nothing for a person the caller cannot see,
--    the trigger would fall through, and the operator would get the raw
--    constraint violation this migration exists to prevent.
--
--    The pre-existing "revoked cannot be primary" check is preserved verbatim.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_person_identifier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _owner_name  text;
  _owner_scope text;
  _may_see     boolean;
BEGIN
  IF NEW.is_primary = true AND NEW.status = 'revoked' THEN
    RAISE EXCEPTION 'A revoked identifier cannot be primary';
  END IF;

  -- Phase 8.4: friendly guard in front of uq_person_identifiers_contact_global.
  IF NEW.status <> 'revoked'
     AND NEW.kind IN ('mobile_e164', 'landline', 'email')
     AND NEW.value_normalized IS NOT NULL THEN

    SELECT p.display_name, p.visibility_scope
      INTO _owner_name, _owner_scope
    FROM public.person_identifiers i
    JOIN public.persons p ON p.id = i.person_id
    WHERE i.kind = NEW.kind
      AND i.value_normalized = NEW.value_normalized
      AND i.status <> 'revoked'
      AND i.person_id <> NEW.person_id
      AND i.id IS DISTINCT FROM NEW.id
    LIMIT 1;

    IF _owner_name IS NOT NULL THEN
      _may_see := CASE _owner_scope
        WHEN 'internal_general'     THEN public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','sales','viewer']::text[])
        WHEN 'restricted_finance'   THEN public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[])
        WHEN 'restricted_executive' THEN public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[])
        ELSE false
      END;

      IF COALESCE(_may_see, false) THEN
        RAISE EXCEPTION 'این شماره قبلاً برای شخص «%» ثبت شده است. هر شماره فقط به یک شخص تعلق دارد.', _owner_name
          USING ERRCODE = '23505';
      ELSE
        RAISE EXCEPTION 'این شماره قبلاً برای شخص دیگری ثبت شده است. هر شماره فقط به یک شخص تعلق دارد.'
          USING ERRCODE = '23505';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.validate_person_identifier() IS
  'Trigger guard on person_identifiers. Keeps the original rule that a revoked identifier cannot be primary, and since Phase 8.4 (241) turns the global contact-uniqueness violation into a clear Persian message instead of a bare constraint error. It names the conflicting person ONLY when the caller''s roles already satisfy that person''s visibility_scope, so it discloses nothing the persons SELECT policy would not.';

NOTIFY pgrst, 'reload schema';
