SET client_encoding = 'UTF8';

-- 581 — attach a first Asan code to an existing person (Part B).
-- Built on live pg_get_functiondef of asan_classify / asan_commit (evidence/G4).

--------------------------------------------------------------------------------
-- 1. Allow attach_code on Asan person rows
--------------------------------------------------------------------------------
DO $chk$
BEGIN
  ALTER TABLE public.asan_import_person_rows
    DROP CONSTRAINT IF EXISTS asan_import_person_rows_classification_check;
  ALTER TABLE public.asan_import_person_rows
    ADD CONSTRAINT asan_import_person_rows_classification_check
    CHECK (classification = ANY (ARRAY[
      'new'::text, 'update'::text, 'conflict'::text, 'unchanged'::text, 'attach_code'::text
    ]));
END
$chk$;

--------------------------------------------------------------------------------
-- 2. Patch live asan_classify: mobile + no existing code → attach_code
--------------------------------------------------------------------------------
DO $cls$
DECLARE
  _oid oid;
  _def text;
  _orig text;
  _anchor text := $a$CASE WHEN _cnt > 0 THEN 'conflict' ELSE 'update' END$a$;
  _repl text := $a$CASE
               WHEN _cnt > 0 THEN 'conflict'
               WHEN _code IS NOT NULL AND NOT EXISTS (
                 SELECT 1 FROM public.person_identifiers pix
                  WHERE pix.person_id = _pid AND pix.kind = 'asan_person_code'
                    AND pix.status <> 'revoked'
               ) THEN 'attach_code'
               ELSE 'update' END$a$;
  _hits integer;
  _qb integer;
  _qa integer;
BEGIN
  SELECT p.oid INTO _oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'asan_classify_person_batch';
  IF _oid IS NULL THEN
    RAISE EXCEPTION '581: asan_classify_person_batch missing';
  END IF;
  _def := pg_get_functiondef(_oid);
  IF position($a$'attach_code'$a$ in _def) > 0 THEN
    RAISE NOTICE '581: classify already has attach_code';
    RETURN;
  END IF;
  _hits := (length(_def) - length(replace(_def, _anchor, ''))) / length(_anchor);
  IF _hits <> 1 THEN
    RAISE EXCEPTION '581: classify anchor matched % times', _hits;
  END IF;
  _orig := _def;
  _def := replace(_def, _anchor, _repl);
  _qb := length(_orig) - length(replace(_orig, '?', ''));
  _qa := length(_def) - length(replace(_def, '?', ''));
  IF _qa <> _qb THEN
    RAISE EXCEPTION '581: classify ? count % -> %', _qb, _qa;
  END IF;
  EXECUTE _def;
END
$cls$;

--------------------------------------------------------------------------------
-- 3. Patch live asan_commit: process attach_code like update
--------------------------------------------------------------------------------
DO $cmt$
DECLARE
  _oid oid;
  _def text;
  _orig text;
  _anchor text := $a$AND classification IN ('new', 'update')$a$;
  _repl text := $a$AND classification IN ('new', 'update', 'attach_code')$a$;
  _hits integer;
  _qb integer;
  _qa integer;
BEGIN
  SELECT p.oid INTO _oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'asan_commit_person_batch';
  IF _oid IS NULL THEN
    RAISE EXCEPTION '581: asan_commit_person_batch missing';
  END IF;
  _def := pg_get_functiondef(_oid);
  IF position($a$'attach_code'$a$ in _def) > 0 THEN
    RAISE NOTICE '581: commit already has attach_code';
    RETURN;
  END IF;
  _hits := (length(_def) - length(replace(_def, _anchor, ''))) / length(_anchor);
  IF _hits <> 1 THEN
    RAISE EXCEPTION '581: commit anchor matched % times', _hits;
  END IF;
  _orig := _def;
  _def := replace(_def, _anchor, _repl);
  _qb := length(_orig) - length(replace(_orig, '?', ''));
  _qa := length(_def) - length(replace(_def, '?', ''));
  IF _qa <> _qb THEN
    RAISE EXCEPTION '581: commit ? count % -> %', _qb, _qa;
  END IF;
  EXECUTE _def;
END
$cmt$;

--------------------------------------------------------------------------------
-- 4. person_assign_asan_code — first code only, admin/accountant
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.person_assign_asan_code(p_person_id uuid, p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _norm text;
  _owner uuid;
  _origin text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(_uid, 'admin'::text) OR public.has_role(_uid, 'accountant'::text)) THEN
    RAISE EXCEPTION 'ثبت کد اسان روی پروندهٔ موجود فقط برای حسابدار و مدیر سیستم مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'شناسه شخص الزامی است.' USING ERRCODE = '22023';
  END IF;

  SELECT origin INTO _origin FROM public.persons WHERE id = p_person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'شخص پیدا نشد.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.person_identifiers
     WHERE person_id = p_person_id
       AND kind = 'asan_person_code'
       AND status <> 'revoked'
  ) THEN
    RAISE EXCEPTION 'این پرونده از قبل کد اسان دارد و از این مسیر قابل تغییر نیست.'
      USING ERRCODE = '22023';
  END IF;

  _norm := public.normalize_identifier('asan_person_code', coalesce(p_code, ''), false);
  IF _norm IS NULL THEN
    RAISE EXCEPTION 'کد حساب آسان نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  SELECT person_id INTO _owner
    FROM public.person_identifiers
   WHERE kind = 'asan_person_code'
     AND value_normalized = _norm
     AND status <> 'revoked'
   LIMIT 1;

  IF _owner IS NOT NULL AND _owner IS DISTINCT FROM p_person_id THEN
    RAISE EXCEPTION 'این کد آسان قبلاً برای شخص دیگری ثبت شده است.'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.person_identifiers (
    person_id, kind, value_raw, value_normalized, status, is_primary, created_by
  ) VALUES (
    p_person_id, 'asan_person_code', _norm, _norm, 'confirmed', true, _uid
  );

  -- origin must not change
  UPDATE public.persons SET origin = _origin WHERE id = p_person_id AND origin IS DISTINCT FROM _origin;

  RETURN jsonb_build_object('person_id', p_person_id, 'asan_code', _norm, 'origin', _origin);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.person_assign_asan_code(uuid, text) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 5. Note person ids created in this transaction (D4b detection)
-- xmin = pg_current_xact_id()::xid is false inside a PL/pgSQL EXCEPTION
-- subtransaction (xmin is the subxid; pg_current_xact_id is the top xid).
-- A transaction-local GUC set from AFTER INSERT on persons is the reliable
-- "created in this xact" signal and does not depend on SELECT of persons.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_note_person_created_in_xact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
BEGIN
  PERFORM set_config(
    'afrakala.persons_created_in_xact',
    COALESCE(NULLIF(current_setting('afrakala.persons_created_in_xact', true), ''), '')
      || NEW.id::text || ',',
    true
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_note_person_created_in_xact ON public.persons;
CREATE TRIGGER trg_note_person_created_in_xact
  AFTER INSERT ON public.persons
  FOR EACH ROW EXECUTE FUNCTION public.tg_note_person_created_in_xact();

--------------------------------------------------------------------------------
-- 6. Table-level gate on asan_person_code (stops direct PostgREST too)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_asan_code_role_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _privileged boolean;
  _kind text;
  _created text;
  _same_xact boolean;
BEGIN
  _kind := CASE WHEN TG_OP = 'DELETE' THEN OLD.kind ELSE NEW.kind END;
  IF TG_OP = 'UPDATE' AND (
       OLD.kind = 'asan_person_code' OR NEW.kind = 'asan_person_code'
     ) THEN
    _kind := 'asan_person_code';
  END IF;
  IF _kind IS DISTINCT FROM 'asan_person_code' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  _privileged := public.has_role(_uid, 'admin'::text)
              OR public.has_role(_uid, 'accountant'::text);

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF NOT COALESCE(_privileged, false) THEN
      RAISE EXCEPTION 'ثبت کد اسان روی پروندهٔ موجود فقط برای حسابدار و مدیر سیستم مجاز است.'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- INSERT
  IF COALESCE(_privileged, false) THEN
    RETURN NEW;
  END IF;

  _created := COALESCE(current_setting('afrakala.persons_created_in_xact', true), '');
  _same_xact := position(NEW.person_id::text IN _created) > 0;

  IF COALESCE(_same_xact, false) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ثبت کد اسان روی پروندهٔ موجود فقط برای حسابدار و مدیر سیستم مجاز است.'
    USING ERRCODE = '42501';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_asan_code_role_gate ON public.person_identifiers;
CREATE TRIGGER trg_asan_code_role_gate
  BEFORE INSERT OR UPDATE OR DELETE ON public.person_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.tg_asan_code_role_gate();

INSERT INTO supabase_migrations.schema_migrations (version, inserted_at)
SELECT '20260923141000', now()
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260923141000'
 );
