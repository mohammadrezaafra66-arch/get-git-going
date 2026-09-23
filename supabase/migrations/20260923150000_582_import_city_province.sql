SET client_encoding='UTF8';

-- 582 — optional city + province on Didar and Asan person import.
-- Live asan_commit / didar_commit were dumped first (research/didar-import/evidence/G-city).
-- Empty AfraKala fields are filled; a non-empty city/province is never overwritten.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS province text;

COMMENT ON COLUMN public.customers.province IS
  'Optional province from Didar/Asan import or the customer form. Never required.';

ALTER TABLE public.didar_import_person_rows
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text;

ALTER TABLE public.asan_import_person_rows
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS province text;

--------------------------------------------------------------------------------
-- Patch live asan_commit: write city/province on new customers; fill empties on update
--------------------------------------------------------------------------------
DO $asan$
DECLARE
  _oid oid;
  _def text;
  _orig text;
  _anchor text := $a$INSERT INTO public.customers (name, phone, person_id)
      VALUES (btrim(_r.display_name),
              NULLIF(btrim(coalesce(_r.mobile_raw, '')), ''),
              _pid);
    END IF;$a$;
  _repl text := $a$INSERT INTO public.customers (name, phone, address, city, province, person_id)
      VALUES (btrim(_r.display_name),
              NULLIF(btrim(coalesce(_r.mobile_raw, '')), ''),
              NULLIF(btrim(coalesce(_r.address, '')), ''),
              NULLIF(btrim(coalesce(_r.city, '')), ''),
              NULLIF(btrim(coalesce(_r.province, '')), ''),
              _pid);
    ELSE
      UPDATE public.customers
         SET city = COALESCE(NULLIF(btrim(COALESCE(city, '')), ''), NULLIF(btrim(COALESCE(_r.city, '')), '')),
             province = COALESCE(NULLIF(btrim(COALESCE(province, '')), ''), NULLIF(btrim(COALESCE(_r.province, '')), ''))
       WHERE person_id = _pid;
    END IF;$a$;
  _hits integer;
BEGIN
  SELECT p.oid INTO _oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'asan_commit_person_batch';
  IF _oid IS NULL THEN
    RAISE EXCEPTION '582: asan_commit_person_batch missing';
  END IF;
  _def := pg_get_functiondef(_oid);
  IF position($a$_r.city$a$ in _def) > 0 AND position($a$_r.province$a$ in _def) > 0 THEN
    RAISE NOTICE '582: asan_commit already writes city/province';
    RETURN;
  END IF;
  _hits := (length(_def) - length(replace(_def, _anchor, ''))) / length(_anchor);
  IF _hits <> 1 THEN
    RAISE EXCEPTION '582: asan_commit customer INSERT anchor matched % times', _hits;
  END IF;
  _orig := _def;
  _def := replace(_def, _anchor, _repl);
  EXECUTE _def;
END
$asan$;

--------------------------------------------------------------------------------
-- Patch live didar_commit: write city/province on insert; fill empties if customer exists
--------------------------------------------------------------------------------
DO $didar$
DECLARE
  _oid oid;
  _def text;
  _anchor text := $a$INSERT INTO public.customers (name, phone, address, person_id, didar_contact_id)
      VALUES (
        _name,
        NULLIF(btrim(coalesce(_r.mobile_raw, '')), ''),
        NULLIF(btrim(coalesce(_r.address, '')), ''),
        _pid,
        NULLIF(btrim(coalesce(_r.didar_id, '')), '')
      );
    ELSE
      UPDATE public.customers
         SET didar_contact_id = coalesce(didar_contact_id, NULLIF(btrim(coalesce(_r.didar_id, '')), ''))
       WHERE person_id = _pid;$a$;
  _repl text := $a$INSERT INTO public.customers (name, phone, address, city, province, person_id, didar_contact_id)
      VALUES (
        _name,
        NULLIF(btrim(coalesce(_r.mobile_raw, '')), ''),
        NULLIF(btrim(coalesce(_r.address, '')), ''),
        NULLIF(btrim(coalesce(_r.city, '')), ''),
        NULLIF(btrim(coalesce(_r.province, '')), ''),
        _pid,
        NULLIF(btrim(coalesce(_r.didar_id, '')), '')
      );
    ELSE
      UPDATE public.customers
         SET didar_contact_id = coalesce(didar_contact_id, NULLIF(btrim(coalesce(_r.didar_id, '')), '')),
             city = COALESCE(NULLIF(btrim(COALESCE(city, '')), ''), NULLIF(btrim(COALESCE(_r.city, '')), '')),
             province = COALESCE(NULLIF(btrim(COALESCE(province, '')), ''), NULLIF(btrim(COALESCE(_r.province, '')), ''))
       WHERE person_id = _pid;$a$;
  _hits integer;
BEGIN
  SELECT p.oid INTO _oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'didar_commit_person_batch';
  IF _oid IS NULL THEN
    RAISE EXCEPTION '582: didar_commit_person_batch missing';
  END IF;
  _def := pg_get_functiondef(_oid);
  IF position($a$city, province, person_id, didar_contact_id$a$ in _def) > 0 THEN
    RAISE NOTICE '582: didar_commit already writes city/province';
    RETURN;
  END IF;
  _hits := (length(_def) - length(replace(_def, _anchor, ''))) / length(_anchor);
  IF _hits <> 1 THEN
    RAISE EXCEPTION '582: didar_commit customer INSERT anchor matched % times', _hits;
  END IF;
  _def := replace(_def, _anchor, _repl);
  EXECUTE _def;
END
$didar$;

INSERT INTO supabase_migrations.schema_migrations (version, inserted_at)
SELECT '20260923150000', now()
 WHERE NOT EXISTS (
   SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260923150000'
 );
