SET client_encoding='UTF8';

-- ============================================================================
-- 498 - call_log_extensions: which PBX extension belongs to which employee.
-- ============================================================================
--
-- THE GAP THIS FILLS
-- ------------------
-- D-35: extensions are named from inside the assistant, by a person, not discovered
-- from the PBX. Nothing in the schema held an extension number before - a whole-schema
-- search for a column or table matching extension|phone|call|pbx|sip|asterisk|cdr
-- returned no extension column at all (docs/research/issabel-groundwork-20260906.md,
-- section C3). Without this table a CDR import can be read but cannot be attributed:
-- every imported call would name an extension nobody can resolve to a person.
--
-- WHAT employee_id ACTUALLY POINTS AT - MEASURED, NOT ASSUMED
-- ----------------------------------------------------------
-- The brief asked whether this should reference persons, profiles or auth.users. It is
-- profiles, and the measurement is unambiguous:
--
--   SELECT count(*) FROM employee_scores                              ->  9
--     ... JOIN auth.users    u  ON u.id  = employee_scores.employee_id ->  9   (all)
--     ... JOIN public.profiles p ON p.id = employee_scores.employee_id ->  9   (all)
--     ... JOIN public.persons  p ON p.id = employee_scores.employee_id ->  0   (none)
--
-- and call_logs' own SELECT policy settles it beyond doubt:
--
--   USING ((employee_id = auth.uid()) OR has_role(auth.uid(),'admin') OR ...)
--
-- employee_id IS the authenticated user's id. An employee here is a STAFF LOGIN, not a
-- business party, so this is not the Phase 2 unified-persons question at all: the person
-- who answers extension 201 is an app user, and profiles.id is that user's id (it is
-- auth.users.id mirrored). public.profiles is also the repo's settled convention for a
-- staff reference - employee_achievements, employee_leagues, employee_level_up_events
-- and employee_mission_progress all declare `employee_id ... REFERENCES profiles(id)`.
--
-- CONSEQUENCE FOR CLAUDE.md RULE 9 / MIGRATION 328
-- ------------------------------------------------
-- Because neither foreign key here points at public.persons, the event trigger
-- trg_person_fk_registry_gate has nothing to check and person_merge's _registry needs no
-- new key. That is a measured conclusion, not an assumption, and this migration proves
-- it rather than asserting it: the persons FK count and the registry report are captured
-- as they were BEFORE (31 FKs, 31 registry rows, 0 verdicts other than 'ok') and
-- re-checked at the end. If a future author changes employee_id to reference persons,
-- that assertion fails loudly and points them at rule 9 - which is the outcome rule 9
-- exists to produce. The gate is left fully armed; nothing here disables it.
--
-- WHY employee_id IS NULLABLE
-- ---------------------------
-- An extension can be known before its owner is. The owner names extensions through the
-- admin screen, and a reception line, a queue, or a handset waiting to be assigned is a
-- real state. Forcing an employee at insert time would make the operator invent one.
-- ON DELETE SET NULL for the same reason: if a staff profile is removed the extension
-- itself still exists on the PBX, so the row survives and simply becomes unassigned.
--
-- The list of which employee holds which extension is owner-supplied and is NOT part of
-- this migration. This table is created EMPTY, deliberately. No mapping is invented.
--
-- RLS
-- ---
-- admin and manager write; every authenticated user reads. Reading is deliberately open
-- to all authenticated users because the mapping is not sensitive - it is the office
-- phone list - and because a salesperson's own call history screen has to be able to
-- resolve an extension to a name. anon gets nothing, asserted at the end of this file.
--
-- The text[] overload of has_any_role is used deliberately and cast explicitly:
-- user_roles.role is TEXT, both has_any_role(uuid, text[]) and has_any_role(uuid,
-- app_role[]) exist, and an uncast array literal is ambiguous between them.
--
-- No DROP TABLE, no TRUNCATE, no DELETE, no existing object altered.
-- Rollback: docs/verification/498-down.sql
-- ============================================================================

SET lock_timeout = '60s';


-- ----------------------------------------------------------------------------
-- 1. The table.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_log_extensions (
  extension    text PRIMARY KEY
               CHECK (extension = btrim(extension)
                      AND length(extension) BETWEEN 1 AND 32),
  employee_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  label        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.call_log_extensions IS
  'PBX extension -> employee. Owner decision D-35: extensions are named from inside the '
  'assistant, not discovered from the phone system. Joined from call_logs.extension. '
  'Created empty by migration 498; the owner fills it through /admin/call-extensions.';

COMMENT ON COLUMN public.call_log_extensions.extension IS
  'The extension number as the PBX writes it, as TEXT and never numeric: leading zeros '
  'are significant and some dial plans use non-digits. Stored trimmed, and it is the '
  'primary key -- one extension belongs to at most one employee.';

COMMENT ON COLUMN public.call_log_extensions.employee_id IS
  'public.profiles(id), which is the authenticated user id -- the same value '
  'call_logs.employee_id holds and the same one call_logs'' RLS compares to auth.uid(). '
  'NULL means the extension is known but not yet assigned to anyone.';

COMMENT ON COLUMN public.call_log_extensions.label IS
  'What this extension is called in the office -- "reception", "warehouse desk". Free '
  'text, for humans; nothing joins on it.';

CREATE INDEX IF NOT EXISTS idx_call_log_extensions_employee
  ON public.call_log_extensions (employee_id)
  WHERE employee_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 2. updated_at, using the schema's existing helper rather than a new one.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_call_log_extensions_updated_at ON public.call_log_extensions;
CREATE TRIGGER trg_call_log_extensions_updated_at
  BEFORE UPDATE ON public.call_log_extensions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 3. RLS.
-- ----------------------------------------------------------------------------
ALTER TABLE public.call_log_extensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_log_extensions_select_authenticated ON public.call_log_extensions;
CREATE POLICY call_log_extensions_select_authenticated ON public.call_log_extensions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS call_log_extensions_insert_admin_manager ON public.call_log_extensions;
CREATE POLICY call_log_extensions_insert_admin_manager ON public.call_log_extensions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[]));

DROP POLICY IF EXISTS call_log_extensions_update_admin_manager ON public.call_log_extensions;
CREATE POLICY call_log_extensions_update_admin_manager ON public.call_log_extensions
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[]));

DROP POLICY IF EXISTS call_log_extensions_delete_admin_manager ON public.call_log_extensions;
CREATE POLICY call_log_extensions_delete_admin_manager ON public.call_log_extensions
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'manager']::text[]));


-- ----------------------------------------------------------------------------
-- 4. Grants. anon gets nothing, explicitly, and it is asserted below. The default
--    privileges in this database already grant only postgres, authenticated and
--    service_role on a new public table, so these REVOKEs are belt and braces -- which
--    is the point: migration 477 had to close 202 tables' worth of grants nobody ever
--    revoked, and the way that does not happen again is that every new table says so.
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.call_log_extensions FROM PUBLIC;
REVOKE ALL ON TABLE public.call_log_extensions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.call_log_extensions TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. Assertions.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  _anon      text;
  _persons   int;
  _reg_rows  int;
  _reg_bad   int;
  _fk_target oid;
BEGIN
  -- 5a. Rule 9 / migration 328: this table added NO foreign key to persons, so the
  --     person_merge registry must be exactly as it was before this migration ran.
  SELECT count(*) INTO _persons
    FROM pg_constraint WHERE contype = 'f' AND confrelid = 'public.persons'::regclass;
  IF _persons <> 31 THEN
    RAISE EXCEPTION
      '498: persons now has % FKs, expected the pre-498 count of 31. If this migration '
      'added one, CLAUDE.md rule 9 applies: register it in person_merge BEFORE the '
      'ALTER TABLE, or the 328 event trigger disables merging for every person.',
      _persons;
  END IF;

  PERFORM public.assert_person_fk_registry();

  SELECT count(*), count(*) FILTER (WHERE verdict <> 'ok')
    INTO _reg_rows, _reg_bad
    FROM public.person_fk_registry_report();
  IF _reg_rows <> 31 OR _reg_bad <> 0 THEN
    RAISE EXCEPTION '498: registry report is % rows with % not ok (expected 31 / 0)',
      _reg_rows, _reg_bad;
  END IF;

  -- 5b. employee_id really points at profiles, not persons and not auth.users.
  SELECT confrelid INTO _fk_target
    FROM pg_constraint
   WHERE contype = 'f'
     AND conrelid = 'public.call_log_extensions'::regclass
     AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'public.call_log_extensions'::regclass
                            AND attname = 'employee_id')];
  IF _fk_target IS DISTINCT FROM 'public.profiles'::regclass THEN
    RAISE EXCEPTION '498: employee_id references %, expected public.profiles',
      COALESCE(_fk_target::regclass::text, '<no FK at all>');
  END IF;

  -- 5c. anon holds nothing at all on this table.
  SELECT string_agg(p, ', ') INTO _anon
    FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                      'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
   WHERE has_table_privilege('anon', 'public.call_log_extensions', p);
  IF _anon IS NOT NULL THEN
    RAISE EXCEPTION '498: anon still holds % on call_log_extensions', _anon;
  END IF;

  -- 5d. RLS on, four policies.
  IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.call_log_extensions'::regclass) THEN
    RAISE EXCEPTION '498: row level security is not enabled on call_log_extensions';
  END IF;
  IF (SELECT count(*) FROM pg_policy
       WHERE polrelid = 'public.call_log_extensions'::regclass) <> 4 THEN
    RAISE EXCEPTION '498: expected exactly 4 policies on call_log_extensions';
  END IF;

  -- 5e. The table is EMPTY. No mapping was invented by this migration.
  IF (SELECT count(*) FROM public.call_log_extensions) <> 0 THEN
    RAISE EXCEPTION '498: call_log_extensions is not empty -- no migration should seed it';
  END IF;

  RAISE NOTICE
    '498 OK: call_log_extensions created empty; employee_id -> profiles; persons FKs still %; anon has nothing',
    _persons;
END
$do$;
