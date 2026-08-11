-- Rollback for migration 287 (register asan_import_person_rows.matched_person_id).
--
-- No BEGIN/COMMIT: transaction control belongs to the caller (rule 2.4).
--
-- Removes the single registry line 287 inserted, by the same live-definition patch in reverse.
-- Note what this restores you to: a database where `person_merge` REFUSES to run at all while
-- `asan_import_person_rows` exists, because it halts on any unregistered foreign key to
-- `persons`. If the intent is to undo the Asan person importer, roll back 285 as well.
SET client_encoding='UTF8';

DO $do$
DECLARE
  _oid  oid;
  _def  text;
  _line text := $a$'asan_import_person_rows.matched_person_id',                'generic',$a$;
BEGIN
  SELECT p.oid INTO _oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'person_merge';
  IF _oid IS NULL THEN RETURN; END IF;

  _def := pg_get_functiondef(_oid);
  IF position(_line in _def) = 0 THEN
    RAISE NOTICE '287-down: nothing to remove';
    RETURN;
  END IF;

  _def := replace(_def, _line || E'\n    ', '');
  EXECUTE _def;
END
$do$;
