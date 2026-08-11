-- 287: register `asan_import_person_rows.matched_person_id` in the person_merge registry.
--
-- Forward fix for migration 285, which added that column — a new foreign key to `persons` —
-- without registering it. `person_merge` deliberately reads its work list from `pg_constraint`
-- and **halts on any key it does not recognise**, so from 285 onward every merge aborted with
-- «ادغام متوقف شد: ستون «asan_import_person_rows…»». That is the protector doing its job, not
-- something broken: the alternative is a merge that silently leaves a staged import row
-- pointing at a person that no longer exists.
--
-- It was invisible until now because phase 3.3 ran only `e2e/asan/`. The M3 gate's full suite
-- caught it, as two reds in `e2e/persons/merge-ui*.spec.ts`. This is the same failure mode
-- migration 271 fixed for `profiles.person_id`, in the same costume.
--
-- ── Why `generic` and not `identity_root` ──────────────────────────────────────
-- `identity_root` is for `customers` / `suppliers` / `external_parties`, where the row IS the
-- person's file in that role and carries financial state that must be merged first.
-- `asan_import_person_rows.matched_person_id` is neither: it is not unique (many staged rows
-- may point at one person), it carries no financial state, and it is a note about what an
-- import proposed. Repointing it at the surviving person is exactly right, and that is what
-- `generic` does.
--
-- ── Why this is a patch of the live definition, not a rewrite ──────────────────
-- Rule 2.3: build from the live text, never from a file and never from memory. The live
-- definition is ~15 KB and carries nine Persian message literals; retyping it to change one
-- line is precisely how a previous session nearly destroyed a function. So this migration
-- reads `pg_get_functiondef`, inserts **one line** next to a proven-unique anchor, and
-- re-executes it. The anchor is asserted to match exactly once — if the function ever changes
-- shape, this aborts rather than guessing. A snapshot of the pre-change definition is in
-- `docs/verification/pre-287/person_merge.live.sql`.
--
-- Rollback: docs/verification/287-down.sql
SET client_encoding='UTF8';

DO $do$
DECLARE
  _oid    oid;
  _def    text;
  _orig   text;
  _anchor text := $a$'profiles.person_id',$a$;
  _line   text := $a$'asan_import_person_rows.matched_person_id',                'generic',$a$;
  _hits   integer;
  _q_before integer;
  _q_after  integer;
BEGIN
  SELECT p.oid INTO _oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'person_merge';
  IF _oid IS NULL THEN
    RAISE EXCEPTION '287: public.person_merge does not exist';
  END IF;

  _def := pg_get_functiondef(_oid);

  -- Idempotent: re-running this migration must be a no-op, not a second insertion.
  IF position($a$'asan_import_person_rows.matched_person_id'$a$ in _def) > 0 THEN
    RAISE NOTICE '287: asan_import_person_rows.matched_person_id already registered';
    RETURN;
  END IF;

  -- Occurrence count without regex, so a `.` in the anchor cannot quietly match any character.
  _hits := (length(_def) - length(replace(_def, _anchor, ''))) / length(_anchor);
  IF _hits <> 1 THEN
    RAISE EXCEPTION '287: anchor matched % times, expected exactly 1 — person_merge has changed shape', _hits;
  END IF;

  _orig := _def;
  _def  := replace(_def, _anchor, _line || E'\n    ' || _anchor);

  -- Corruption check, done as a BEFORE/AFTER comparison rather than "contains no ?".
  -- The absolute form is wrong here and was caught by its own dry run: `person_merge`
  -- legitimately contains `IF NOT (_registry ? _key)` — `?` is the jsonb key-existence
  -- operator, and it is the very mechanism this registry is read with. What matters is that
  -- the patch, whose inserted line is pure ASCII, does not ADD one: a `?` appearing where a
  -- Persian character used to be is the 2026-07-11 corruption signature.
  _q_before := length(_orig) - length(replace(_orig, '?', ''));
  _q_after  := length(_def)  - length(replace(_def,  '?', ''));
  IF _q_after <> _q_before THEN
    RAISE EXCEPTION '287: ? count changed % -> % — Persian text was corrupted', _q_before, _q_after;
  END IF;

  EXECUTE _def;
END
$do$;

-- ------------------------------------------------------------------- checks ----
DO $chk$
DECLARE _def text; _n integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'person_merge';

  IF position($a$'asan_import_person_rows.matched_person_id'$a$ in _def) = 0 THEN
    RAISE EXCEPTION '287: the registry line was not applied';
  END IF;
  IF position($a$'profiles.person_id'$a$ in _def) = 0 THEN
    RAISE EXCEPTION '287: the patch lost profiles.person_id';
  END IF;
  -- The Persian refusal messages must still be there. `?`-counting above proves nothing was
  -- replaced by `?`; this proves the non-ASCII text was not dropped altogether.
  IF _def !~ '[^\x00-\x7F]' THEN
    RAISE EXCEPTION '287: the rewritten definition has no non-ASCII text left';
  END IF;

  -- Every foreign key that points at `persons` must be known to the merge, or the next new
  -- column repeats 285's mistake silently. This is the assertion 285 should have carried.
  SELECT count(*) INTO _n
    FROM pg_constraint con
    JOIN pg_class cl  ON cl.oid = con.conrelid
    JOIN pg_class ref ON ref.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
   WHERE con.contype = 'f' AND ref.relname = 'persons' AND ns.nspname = 'public'
     AND position('''' || cl.relname || '.' || att.attname || '''' in _def) = 0;
  IF _n <> 0 THEN
    RAISE EXCEPTION '287: % foreign keys to persons are still unknown to person_merge', _n;
  END IF;
END
$chk$;
