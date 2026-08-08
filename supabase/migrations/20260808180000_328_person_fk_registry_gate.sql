SET client_encoding='UTF8';

-- ============================================================================
-- 328 — Standing gate: every FK to `persons` must be registered with person_merge.
-- ============================================================================
--
-- WHY THIS EXISTS
-- ---------------
-- `person_merge` deliberately reads its worklist from `pg_constraint` and HALTS on any
-- column referencing `persons` that has no policy in its internal `_registry`. That guard
-- is correct: the alternative is a merge that silently leaves rows pointing at a person
-- who no longer exists. But the failure is not "one feature degrades" — it is
-- MERGING STOPS WORKING FOR EVERY PERSON IN THE SYSTEM, from the moment the migration
-- that added the FK is applied.
--
-- That has now happened THREE times, each time found only after the fact:
--   • migration 271 — `profiles.person_id`, added by 270
--   • migration 287 — `asan_import_person_rows.matched_person_id`, added by 285
--   • migration 324 — `mutual_settlements.person_id`, added by 319
-- Every one of those authors had read the previous incident in PROGRESS.md and walked
-- into it anyway. Documentation has failed three times; this is the mechanical fix.
--
-- There is a fourth, opposite case that this gate also covers, and which no previous
-- incident caught: REMOVING a table that owns a registered FK. person_merge's final loop
-- iterates the REGISTRY (not pg_constraint) and passes every key to
-- `_person_merge_count_refs`, which casts 'public.'||table to regclass. For a dropped
-- table that cast raises 42P01 — so a stale registry entry breaks every merge just as
-- completely as a missing one. Proven on the live database on 2026-08-08 by renaming
-- `invoices` inside a rolled-back transaction:
--     ERR -> relation "public.invoices" does not exist  [SQLSTATE 42P01]
--
-- WHAT THIS DOES
-- --------------
-- An event trigger on CREATE TABLE / ALTER TABLE / DROP TABLE re-checks that the set of
-- FKs to `persons` and the set of registry keys are exactly equal. A mismatch aborts the
-- DDL, which — because migrations run in a single transaction — aborts the whole
-- migration at the moment the mistake is made, with a message naming the column.
--
-- ORDERING RULE FOR FUTURE MIGRATIONS (this is the part to remember):
--   • ADDING an FK to persons  -> CREATE OR REPLACE person_merge with the new registry
--                                 key FIRST, then ALTER TABLE ... ADD the FK.
--   • DROPPING such a table    -> CREATE OR REPLACE person_merge WITHOUT the key FIRST,
--                                 then DROP TABLE.
-- Doing it in the other order trips this gate. That is intentional: the intermediate
-- state it forbids is the one that breaks merging.
--
-- No data is touched. Nothing is dropped. This migration only adds functions and one
-- event trigger, and asserts that the database is currently balanced (30 = 30).
--
-- Down-script: docs/verification/328-down.sql
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Registry extraction. Kept separate so humans can inspect it directly.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.person_merge_registry_keys()
RETURNS TABLE(registry_key text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  _def   text;
  _block text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'person_merge';

  IF _def IS NULL THEN
    RAISE EXCEPTION 'person_merge وجود ندارد؛ گیت رجیستری نمی‌تواند بررسی کند.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Only the _registry literal, so an unrelated 'a.b' string elsewhere in the body
  -- can never be mistaken for a registry key.
  _block := substring(_def from '_registry\s+constant\s+jsonb\s*:=\s*jsonb_build_object\((.*?)\);');

  -- Fail loud rather than silently returning zero keys: a gate that quietly passes
  -- because it could not read the registry is worse than no gate at all.
  IF _block IS NULL OR btrim(_block) = '' THEN
    RAISE EXCEPTION
      'ساختار رجیستری person_merge شناخته نشد؛ گیت نمی‌تواند تأیید کند. اگر شکل _registry عوض شده، این تابع باید به‌روز شود.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Drop comment lines before matching. The registry literal is heavily commented and
  -- those comments quote things like 'public.persons' when explaining a policy; without
  -- this the gate reports a phantom STALE key. (Found by this migration's own dry-run.)
  SELECT string_agg(l, E'\n')
    INTO _block
    FROM regexp_split_to_table(_block, E'\n') AS l
   WHERE btrim(l) NOT LIKE '--%';

  RETURN QUERY
  SELECT DISTINCT m[1]
  FROM regexp_matches(COALESCE(_block, ''), '''([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)''', 'g') AS m
  -- 'public.persons' and friends are schema-qualified table names, never registry keys.
  WHERE m[1] NOT LIKE 'public.%';
END
$fn$;

COMMENT ON FUNCTION public.person_merge_registry_keys() IS
  'Migration 328 — the table.column keys declared in person_merge''s _registry literal.';


-- ----------------------------------------------------------------------------
-- 2. Human-readable report. Safe to run any time; changes nothing.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.person_fk_registry_report()
RETURNS TABLE(person_fk_column text, exists_as_fk boolean, in_registry boolean, verdict text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  WITH reg AS (SELECT registry_key AS key FROM public.person_merge_registry_keys()),
  fks AS (
    SELECT con.conrelid::regclass::text || '.' || att.attname::text AS key
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f' AND con.confrelid = 'public.persons'::regclass
  )
  SELECT COALESCE(f.key, r.key),
         f.key IS NOT NULL,
         r.key IS NOT NULL,
         CASE
           WHEN f.key IS NOT NULL AND r.key IS NULL
             THEN 'UNREGISTERED: FK exists but person_merge has no policy — every merge halts'
           WHEN f.key IS NULL AND r.key IS NOT NULL
             THEN 'STALE: registry names a column that does not exist — every merge errors 42P01'
           ELSE 'ok'
         END
  FROM fks f FULL OUTER JOIN reg r ON r.key = f.key
  ORDER BY 1;
$fn$;

COMMENT ON FUNCTION public.person_fk_registry_report() IS
  'Migration 328 — compares FKs to persons against person_merge''s registry, both directions.';


-- ----------------------------------------------------------------------------
-- 3. The assertion. Call it directly at the end of any migration that touches
--    the person FK graph, or rely on the event trigger below.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_person_fk_registry()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  _bad   text;
  _count int;
BEGIN
  SELECT string_agg(format('%s (%s)', person_fk_column, verdict), E'\n  ' ORDER BY person_fk_column),
         count(*)
    INTO _bad, _count
    FROM public.person_fk_registry_report()
   WHERE verdict <> 'ok';

  IF COALESCE(_count, 0) > 0 THEN
    RAISE EXCEPTION E'ادغام اشخاص با این تغییر می‌شکند — % ستون با رجیستری person_merge هم‌خوان نیست:\n  %\n\nراهنما: افزودن FK به persons یعنی اول person_merge را با کلید تازه CREATE OR REPLACE کن، بعد ALTER TABLE؛ و حذف چنین جدولی یعنی اول کلید را از رجیستری بردار، بعد DROP. جزئیات در مهاجرت ۳۲۸.',
      _count, _bad
      USING ERRCODE = 'P0001',
            HINT = 'Run: SELECT * FROM public.person_fk_registry_report() WHERE verdict <> ''ok'';';
  END IF;
END
$fn$;

COMMENT ON FUNCTION public.assert_person_fk_registry() IS
  'Migration 328 — raises unless every FK to persons is registered with person_merge, and vice versa.';


-- ----------------------------------------------------------------------------
-- 4. The event trigger: makes the check automatic instead of remembered.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_person_fk_registry_gate()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  -- Skip while the identity core itself is being bootstrapped.
  IF to_regclass('public.persons') IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'person_merge') THEN
    RETURN;
  END IF;

  PERFORM public.assert_person_fk_registry();
END
$fn$;

DROP EVENT TRIGGER IF EXISTS trg_person_fk_registry_gate;
CREATE EVENT TRIGGER trg_person_fk_registry_gate
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'ALTER TABLE', 'DROP TABLE')
  EXECUTE FUNCTION public.tg_person_fk_registry_gate();

COMMENT ON EVENT TRIGGER trg_person_fk_registry_gate IS
  'Migration 328 — aborts any DDL that leaves an FK to persons unregistered with person_merge (or a registry key without its column). See the migration header for the ordering rule.';


-- ----------------------------------------------------------------------------
-- 5. Assert the database is balanced right now, and that the gate is installed.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  _keys int;
  _fks  int;
BEGIN
  PERFORM public.assert_person_fk_registry();

  SELECT count(*) INTO _keys FROM public.person_merge_registry_keys();
  SELECT count(*) INTO _fks
    FROM pg_constraint con
   WHERE con.contype = 'f' AND con.confrelid = 'public.persons'::regclass;

  IF _keys = 0 THEN
    RAISE EXCEPTION '328: registry extraction returned 0 keys — the gate would be blind';
  END IF;
  IF _keys <> _fks THEN
    RAISE EXCEPTION '328: registry has % keys but % FKs exist', _keys, _fks;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'trg_person_fk_registry_gate') THEN
    RAISE EXCEPTION '328: the event trigger was not installed';
  END IF;

  RAISE NOTICE '328 OK: gate installed; % FKs to persons, all registered', _fks;
END
$do$;
