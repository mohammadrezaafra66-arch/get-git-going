SET client_encoding='UTF8';

-- 550 — Database-wide hard-identity gate for ACTIVE persons.
--
-- Goal: no active person can exist without at least one of:
--   mobile_e164  OR  asan_person_code  (non-revoked).
--
-- Why a DEFERRABLE CONSTRAINT TRIGGER, not only person_create_full:
--   Writers that INSERT INTO persons directly (asan_commit_person_batch,
--   admin SQL, future RPCs, PostgREST) bypass RPC checks. Presence of a
--   child-row cannot be a CHECK on persons. A deferred trigger runs at
--   COMMIT, after identifiers in the same transaction have landed — so
--   person_create_full and asan_commit remain valid one-transaction writes.
--
-- Why only ACTIVE persons:
--   person_merge moves identifiers off the loser then sets is_active=false.
--   Requiring hard identity on inactive losers would abort every merge.
--   New registration always creates is_active=true.
--
-- Existing incomplete active rows (legacy) are NOT deleted. They stay until
-- /admin/persons-cleanup completes them. Any future INSERT of an incomplete
-- active person fails at COMMIT. Stripping the last hard id from an active
-- person also fails.

CREATE OR REPLACE FUNCTION public.person_has_hard_identity(p_person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.person_identifiers i
    WHERE i.person_id = p_person_id
      AND i.status <> 'revoked'
      AND i.kind IN ('mobile_e164', 'asan_person_code')
  );
$function$;

COMMENT ON FUNCTION public.person_has_hard_identity(uuid) IS
  'True when the person holds a non-revoked mobile_e164 or asan_person_code.';

CREATE OR REPLACE FUNCTION public.person_require_hard_identity_check(p_person_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _active boolean;
  _name   text;
BEGIN
  SELECT p.is_active, p.display_name
    INTO _active, _name
  FROM public.persons p
  WHERE p.id = p_person_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT COALESCE(_active, false) THEN
    RETURN;
  END IF;

  IF public.person_has_hard_identity(p_person_id) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION
    'شخص فعال «%» بدون شمارهٔ موبایل یا کد آسان قابل ثبت/نگه‌داری نیست.',
    COALESCE(_name, 'بدون‌نام')
    USING ERRCODE = '23514';
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_persons_require_hard_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.person_require_hard_identity_check(NEW.id);
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_person_identifiers_require_hard_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _pid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _pid := OLD.person_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Check both sides when person_id moves (merge) or status/kind changes.
    PERFORM public.person_require_hard_identity_check(OLD.person_id);
    _pid := NEW.person_id;
  ELSE
    _pid := NEW.person_id;
  END IF;
  PERFORM public.person_require_hard_identity_check(_pid);
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_persons_require_hard_identity ON public.persons;
CREATE CONSTRAINT TRIGGER trg_persons_require_hard_identity
  AFTER INSERT OR UPDATE OF is_active, display_name ON public.persons
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_persons_require_hard_identity();

DROP TRIGGER IF EXISTS trg_person_identifiers_require_hard_identity ON public.person_identifiers;
CREATE CONSTRAINT TRIGGER trg_person_identifiers_require_hard_identity
  AFTER DELETE OR UPDATE OF status, kind, person_id, value_normalized ON public.person_identifiers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_person_identifiers_require_hard_identity();

-- Align person_create_full message with the DB-wide rule (active only — same as 548).
-- No body rewrite needed: 548 already rejects active creates without mobile/asan
-- before INSERT. This migration is the catch-all for every other writer.

COMMENT ON TRIGGER trg_persons_require_hard_identity ON public.persons IS
  '550: at COMMIT, every ACTIVE person must hold mobile or Asan code.';

COMMENT ON TRIGGER trg_person_identifiers_require_hard_identity ON public.person_identifiers IS
  '550: cannot strip the last hard identity from an ACTIVE person.';

-- Proofs (rolled back).
DO $$
DECLARE
  _id uuid := gen_random_uuid();
  _failed boolean;
BEGIN
  -- 1) Active person, no identifier → must fail at COMMIT of nested block.
  _failed := false;
  BEGIN
    INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
    VALUES (_id, 'individual', '550-PROOF-NO-ID', 'internal_general', true);
    -- Force deferred triggers now:
    SET CONSTRAINTS trg_persons_require_hard_identity IMMEDIATE;
    RAISE EXCEPTION '550 expected hard-identity failure did not fire';
  EXCEPTION
    WHEN check_violation THEN
      _failed := true; -- 23514
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%موبایل یا کد آسان%' THEN
        _failed := true;
      ELSE
        RAISE;
      END IF;
  END;
  IF NOT _failed THEN
    RAISE EXCEPTION '550: incomplete active insert was accepted';
  END IF;

  -- 2) Active person + mobile in one transaction → OK
  _id := gen_random_uuid();
  INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
  VALUES (_id, 'individual', '550-PROOF-WITH-MOBILE', 'internal_general', true);
  INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
  VALUES (_id, 'mobile_e164', '09120005500', 'provisional', true);
  SET CONSTRAINTS trg_persons_require_hard_identity IMMEDIATE;
  SET CONSTRAINTS trg_person_identifiers_require_hard_identity IMMEDIATE;

  -- 3) Inactive without id → OK (merge-loser shape)
  _id := gen_random_uuid();
  INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
  VALUES (_id, 'individual', '550-PROOF-INACTIVE', 'internal_general', false);
  SET CONSTRAINTS trg_persons_require_hard_identity IMMEDIATE;

  -- Clean proof rows: deactivate first so stripping the last hard id is legal.
  UPDATE public.persons SET is_active = false WHERE display_name LIKE '550-PROOF-%';
  DELETE FROM public.person_identifiers WHERE value_raw = '09120005500';
  DELETE FROM public.persons WHERE display_name LIKE '550-PROOF-%';

  RAISE NOTICE '550 OK: deferred hard-identity gate for active persons';
END
$$;

NOTIFY pgrst, 'reload schema';
