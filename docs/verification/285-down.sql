-- Rollback for migration 285 — the staged Asan person import.
-- No BEGIN/COMMIT: transaction control belongs to the caller (mission control rule 2.4).
--
-- Written during M5.2, when the final sweep found 284 and 285 were the only two migrations in
-- this program without a down script. Recorded as a gap that was closed, not as one that never
-- existed.
--
-- ⚠️ WHAT THIS DOES **NOT** UNDO. `asan_commit_person_batch` writes into `persons` and
-- `person_identifiers`. Those writes are real business data and are **not** reversed here —
-- rule 3, and because a committed import is indistinguishable from a person typed in by hand
-- once it has been edited. This script removes the staging machinery, not its results.
--
-- ⚠️ ORDER MATTERS FOR MIGRATION 287. 287 registered
-- `asan_import_person_rows.matched_person_id` with `person_merge`, because that column is a
-- foreign key to `persons` and `person_merge` halts on any key it does not recognise. Dropping
-- the table here leaves the registry naming a column that no longer exists. Apply
-- `docs/verification/287-down.sql` FIRST, or `person_merge` will start failing on every merge —
-- the exact regression 287 was written to fix, in reverse.
SET client_encoding='UTF8';

DROP TRIGGER IF EXISTS trg_asan_person_row_guard ON public.asan_import_person_rows;

DROP FUNCTION IF EXISTS public.asan_commit_person_batch(uuid);
DROP FUNCTION IF EXISTS public.asan_classify_person_batch(uuid);
DROP FUNCTION IF EXISTS public.tg_asan_person_row_guard();

-- Rows first, then batches: the rows reference the batch.
DROP TABLE IF EXISTS public.asan_import_person_rows;

-- ⚠️ `asan_import_batches` is shared with migration 286 (`kind='products'`). Drop it only if 286
-- is being rolled back too; otherwise the product import loses its batch table.
--   DROP TABLE IF EXISTS public.asan_import_batches;

-- Removing these rows does NOT close the module — `has_dynamic_permission` grants a module with
-- no row at all to every role. This delete is only correct together with removing the route.
DELETE FROM public.role_permissions WHERE module = 'asan-import';
