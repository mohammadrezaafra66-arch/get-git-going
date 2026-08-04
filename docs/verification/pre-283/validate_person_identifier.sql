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
$function$

