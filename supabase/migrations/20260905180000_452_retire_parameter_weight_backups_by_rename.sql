SET client_encoding='UTF8';

-- 452 - retire the two dynamic_parameter_weights backups by RENAME, not DROP.
--
-- ASCII-only by design: every message here is an assertion for a future reader, not a UI
-- string, so the file cannot be damaged by an encoding-mangling transport.
--
-- ============================================================================
-- WHY THESE TWO SURVIVED THE RETIREMENT SWEEP
-- ============================================================================
--
-- Migration 450 retired the superseded tables of unwired wave 1. It dropped exactly one
-- backup -- payment_receipts_backup_20260722, genuinely 0 rows and 0 bytes -- and left these
-- two alone. The wave's own plan had recorded all three as "0 rows". That was wrong, and the
-- way it was wrong is worth writing down because it will happen again:
--
--     backup_142        actual = 18   n_live_tup = 0   last_autoanalyze = NULL
--     backup_20260722   actual = 18   n_live_tup = 0
--
-- `pg_stat_user_tables.n_live_tup` is a PLANNER ESTIMATE, not a count. It stays 0 until the
-- table is analysed, and neither of these ever was. The check that mattered was count(*),
-- and it was not run until an agent refused to drop on an unverified premise.
--
-- The number that settles it: the LIVE table holds 16 rows, these backups hold 18, and
--
--     SELECT count(*) FROM dynamic_parameter_weights_backup_142 b
--      WHERE NOT EXISTS (SELECT 1 FROM dynamic_parameter_weights l WHERE l.id = b.id);
--     -- 2
--
-- Two rows exist here and nowhere else. Dropping would have destroyed the only copy of a
-- scoring weight, silently, on the strength of a statistic nobody had refreshed.
--
-- ============================================================================
-- WHAT THE OWNER DECIDED, 2026-09-05
-- ============================================================================
--
-- Rename to zz_retired_*, matching the four tables 450 already renamed. Explicitly:
--   * do NOT drop -- a rename is reversible, a drop is not, and the evidence does not
--     carry a drop;
--   * do NOT merge these rows into the live dynamic_parameter_weights -- whether a
--     historical weight should return is a scoring decision, not a cleanup, and nothing
--     here is qualified to make it.
--
-- The row counts are asserted below rather than merely commented, so that anyone who reads
-- this file later sees the reason these tables were kept, and so the migration refuses to
-- run at all if the premise has changed underneath it.

DO $guard$
DECLARE
  n_142  integer;
  n_0722 integer;
  n_live integer;
  n_only integer;
BEGIN
  SELECT count(*) INTO n_142  FROM public.dynamic_parameter_weights_backup_142;
  SELECT count(*) INTO n_0722 FROM public.dynamic_parameter_weights_backup_20260722;
  SELECT count(*) INTO n_live FROM public.dynamic_parameter_weights;

  SELECT count(*) INTO n_only
  FROM public.dynamic_parameter_weights_backup_142 b
  WHERE NOT EXISTS (
    SELECT 1 FROM public.dynamic_parameter_weights l WHERE l.id = b.id
  );

  IF n_142 = 0 AND n_0722 = 0 THEN
    RAISE EXCEPTION
      '452: both backups are now empty (142=%, 0722=%). The premise that made a rename the '
      'right call no longer holds -- re-decide rather than letting this migration run.',
      n_142, n_0722;
  END IF;

  RAISE NOTICE '452: backup_142=% rows, backup_20260722=% rows, live dynamic_parameter_weights=% rows',
    n_142, n_0722, n_live;
  RAISE NOTICE '452: % row(s) exist in backup_142 and NOWHERE else -- this is why neither table is dropped',
    n_only;
END
$guard$;

ALTER TABLE public.dynamic_parameter_weights_backup_142
  RENAME TO zz_retired_dynamic_parameter_weights_backup_142;

ALTER TABLE public.dynamic_parameter_weights_backup_20260722
  RENAME TO zz_retired_dynamic_parameter_weights_backup_20260722;

COMMENT ON TABLE public.zz_retired_dynamic_parameter_weights_backup_142 IS
  'Retired by migration 452 (unwired wave 1). NOT dropped: holds 18 rows against the live '
  'table''s 16, and 2 of them exist nowhere else. Renamed rather than dropped because a '
  'rename is reversible. Merging these rows back is a scoring decision for the owner.';

COMMENT ON TABLE public.zz_retired_dynamic_parameter_weights_backup_20260722 IS
  'Retired by migration 452 (unwired wave 1). NOT dropped: holds 18 rows. See the comment on '
  'zz_retired_dynamic_parameter_weights_backup_142.';

-- Verify in the same transaction: new names present, old names gone, rows intact.
DO $verify$
DECLARE
  n_new_142  integer;
  n_new_0722 integer;
  n_old      integer;
BEGIN
  SELECT count(*) INTO n_new_142  FROM public.zz_retired_dynamic_parameter_weights_backup_142;
  SELECT count(*) INTO n_new_0722 FROM public.zz_retired_dynamic_parameter_weights_backup_20260722;

  SELECT count(*) INTO n_old
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('dynamic_parameter_weights_backup_142',
                      'dynamic_parameter_weights_backup_20260722');

  IF n_old <> 0 THEN
    RAISE EXCEPTION '452: an old backup name still exists after the rename';
  END IF;
  IF n_new_142 <> 18 OR n_new_0722 <> 18 THEN
    RAISE EXCEPTION '452: rows were lost in the rename (142=%, 0722=%)', n_new_142, n_new_0722;
  END IF;

  RAISE NOTICE '452: verified - both renamed, old names gone, 18 + 18 rows intact';
END
$verify$;
