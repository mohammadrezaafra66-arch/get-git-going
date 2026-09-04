SET client_encoding = 'UTF8';

-- 431 — A-6. Retire `person_import_batch`, the last database object belonging to the
--       person-import surfaces that were deleted in the same commit.
--
-- FOUR SURFACES EXISTED; ONE WAS EVER USED.
--   /admin/asan-import        asan_commit_person_batch   33 audit rows   <- kept
--   /persons/import           createPerson per row        0 audit rows   <- deleted
--   POST /api/persons/import  person_import_batch         no caller      <- deleted
--   /sales/customers/import   person_import_batch         0 audit rows   <- deleted
--
-- `api.persons.import.ts` claimed in its own docstring to be "the single import entry
-- point" that "replaces the per-entity import paths". Nothing ever called it, and
-- `PersonImportForm` did not use `person_import_batch` at all — the consolidation it
-- announced never happened. Measured in docs/research/dual-identity-and-import-20260904.md
-- (duplicate D2) and re-measured before this migration.
--
-- WHY THE FUNCTION GOES TOO
--   Enforcement (migration 430) has to be written once, in the writer that is actually
--   used. Leaving a second, unenforced writer reachable over PostgREST — it is granted to
--   `authenticated` — would keep a route into `persons` that the new rules do not guard.
--
-- SAFETY
--   * `DROP FUNCTION` is permitted where `DROP TABLE` is not: no data is destroyed.
--   * Callers, measured before the drop:
--       - `select proname from pg_proc where prosrc like '%person_import_batch%'` -> 0 rows
--       - `grep -rn "person_import_batch" src/ e2e/ server/` -> only the deleted files
--   * The signature is named exactly, so an overload could not be dropped by accident.
--   * There is exactly one signature: `person_import_batch(jsonb)`.

DROP FUNCTION IF EXISTS public.person_import_batch(jsonb);
