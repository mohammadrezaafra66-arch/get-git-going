SET client_encoding='UTF8';

-- =============================================================================
-- 245 — Phase 8.4 follow-up: a landline may be shared again
-- =============================================================================
--
-- WHY
--   Migration 241 applied Decision 2 ("one number = one person") to all three
--   contact kinds: mobile_e164, landline and email. That was what the Phase 8
--   brief instructed, and 241 flagged the consequence at the time rather than
--   discovering it later — a landline is not a personal identifier. It
--   identifies a PLACE. Two colleagues on one office line, a company's main
--   number listed against both the firm and its owner, a household phone: all
--   of these are ordinary, and under 241 none of them could be recorded.
--
--   The Phase 8 brief itself names this case. Checkpoint 8.2 gives "two
--   different people who share a number (e.g. a landline)" as the textbook
--   example of a pair that must NOT be merged — a rule that cannot mean
--   anything if two people are forbidden from sharing a landline in the first
--   place. The owner has now confirmed the narrowing.
--
-- WHAT CHANGES
--   landline returns to migration 228's B3 treatment: unique only between
--   CONFIRMED rows. Two provisional landlines may coexist across persons; two
--   *verified* claims on the same line are still a genuine conflict worth
--   refusing, so that much is kept.
--
-- WHAT DOES NOT CHANGE
--   mobile_e164 and email stay globally unique for every non-revoked row.
--   Decision 2 stands for them — a mobile and a mailbox do identify a person.
--   national_id_ir / tax_id_ir / company_reg_id_ir / iban are untouched, as is
--   the one-primary-per-kind rule.
--
-- SAFE BY CONSTRUCTION
--   This migration only ever REMOVES a restriction. Narrowing a unique index
--   cannot fail on existing data, and no row that was legal before becomes
--   illegal. For the record there are currently zero landline identifiers in
--   the system at all (every one of the 14 is a mobile_e164), so nothing is
--   revalidated in practice either.
--
-- THE TRIGGER HAD TO MOVE TOO
--   validate_person_identifier (241) raises a friendly Persian error for
--   'mobile_e164', 'landline' and 'email' whenever another person holds the
--   value. Narrowing only the INDEX would have left that trigger refusing
--   shared landlines anyway — the constraint would look relaxed in \d while
--   the application still rejected the insert. Both move together, and the
--   trigger now mirrors the index exactly:
--     mobile_e164 / email — conflict against any non-revoked row
--     landline            — conflict only between confirmed rows
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Landline: confirmed-only uniqueness, restored.
--    Created BEFORE the wide index is dropped so there is no moment in this
--    transaction where confirmed landlines are unprotected.
-- -----------------------------------------------------------------------------
DO $precheck$
DECLARE _n int;
BEGIN
  SELECT COUNT(*) INTO _n FROM (
    SELECT 1 FROM public.person_identifiers
    WHERE kind = 'landline' AND status = 'confirmed'
    GROUP BY value_normalized HAVING COUNT(DISTINCT person_id) > 1
  ) x;
  IF _n > 0 THEN
    RAISE EXCEPTION
      'ایجاد اندیس یکتایی تلفن ثابت ممکن نیست: % مقدار بین بیش از یک شخص به‌صورت تأییدشده مشترک است.', _n;
  END IF;
  RAISE NOTICE 'Pre-check passed: no confirmed landline is shared between persons.';
END $precheck$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_person_identifiers_landline_confirmed
  ON public.person_identifiers (kind, value_normalized)
  WHERE status = 'confirmed' AND kind = 'landline';

COMMENT ON INDEX public.uq_person_identifiers_landline_confirmed IS
  'فاز ۸ (اصلاح ۲۴۵، ۲۰۲۶-۰۸-۰۲): تلفن ثابت یک «مکان» را مشخص می‌کند نه یک شخص، پس دو نفر می‌توانند یک خط مشترک داشته باشند (مثلاً دو همکار در یک دفتر). یکتایی فقط بین شناسه‌های «تأییدشده» اعمال می‌شود — یعنی همان رفتار B3 مهاجرت ۲۲۸. موبایل و ایمیل همچنان سراسری یکتا هستند.';

-- -----------------------------------------------------------------------------
-- 2. Rebuild the global contact index without landline.
--    Same name, so the rule keeps one identity across migrations. DROP+CREATE
--    inside this transaction is atomic — there is no window where mobile or
--    email uniqueness is unenforced.
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.uq_person_identifiers_contact_global;

CREATE UNIQUE INDEX uq_person_identifiers_contact_global
  ON public.person_identifiers (kind, value_normalized)
  WHERE status <> 'revoked'
    AND kind IN ('mobile_e164', 'email');

COMMENT ON INDEX public.uq_person_identifiers_contact_global IS
  'فاز ۸ (تصمیم ۲)، بازنگری‌شده در ۲۴۵: شمارهٔ موبایل و ایمیل هرکدام فقط به یک شخص تعلق دارند — چه تأییدشده و چه تأییدنشده. تلفن ثابت در ۲۴۵ از این قانون خارج شد چون خطِ یک مکان است نه هویت یک نفر (به uq_person_identifiers_landline_confirmed مراجعه کنید). شناسه‌های باطل‌شده مانع ثبت مجدد نیستند.';

-- -----------------------------------------------------------------------------
-- 3. The trigger, mirrored to the new index shape.
--    Body is 241's definition with the landline branch split out; the
--    revoked-cannot-be-primary rule and the conditional-disclosure logic are
--    unchanged.
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
  _is_conflict boolean := false;
BEGIN
  IF NEW.is_primary = true AND NEW.status = 'revoked' THEN
    RAISE EXCEPTION 'A revoked identifier cannot be primary';
  END IF;

  -- Which rows on OTHER persons count as a conflict for this kind:
  --   mobile_e164 / email — any non-revoked row (Decision 2)
  --   landline            — only when BOTH sides are confirmed (245)
  IF NEW.value_normalized IS NOT NULL AND NEW.status <> 'revoked' THEN
    IF NEW.kind IN ('mobile_e164', 'email') THEN
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
      _is_conflict := _owner_name IS NOT NULL;

    ELSIF NEW.kind = 'landline' AND NEW.status = 'confirmed' THEN
      SELECT p.display_name, p.visibility_scope
        INTO _owner_name, _owner_scope
      FROM public.person_identifiers i
      JOIN public.persons p ON p.id = i.person_id
      WHERE i.kind = 'landline'
        AND i.value_normalized = NEW.value_normalized
        AND i.status = 'confirmed'
        AND i.person_id <> NEW.person_id
        AND i.id IS DISTINCT FROM NEW.id
      LIMIT 1;
      _is_conflict := _owner_name IS NOT NULL;
    END IF;
  END IF;

  IF _is_conflict THEN
    _may_see := CASE _owner_scope
      WHEN 'internal_general'     THEN public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant','sales','viewer']::text[])
      WHEN 'restricted_finance'   THEN public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[])
      WHEN 'restricted_executive' THEN public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[])
      ELSE false
    END;

    IF NEW.kind = 'landline' THEN
      IF COALESCE(_may_see, false) THEN
        RAISE EXCEPTION 'این شمارهٔ تلفن ثابت قبلاً به‌صورت تأییدشده برای شخص «%» ثبت شده است.', _owner_name
          USING ERRCODE = '23505';
      ELSE
        RAISE EXCEPTION 'این شمارهٔ تلفن ثابت قبلاً به‌صورت تأییدشده برای شخص دیگری ثبت شده است.'
          USING ERRCODE = '23505';
      END IF;
    ELSE
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
  'Trigger guard on person_identifiers. Keeps the original rule that a revoked identifier cannot be primary. Since Phase 8.4 (241) it turns a contact-uniqueness violation into a clear Persian message instead of a bare constraint error, naming the conflicting person ONLY when the caller''s roles already satisfy that person''s visibility_scope. Migration 245 split landline out: mobile_e164 and email conflict on any non-revoked row, landline only between confirmed rows, mirroring uq_person_identifiers_contact_global and uq_person_identifiers_landline_confirmed respectively.';

NOTIFY pgrst, 'reload schema';
