-- Rollback for migration 315 (seed role_permissions for accounting / hr / market-rates).
--
-- 315 only INSERTs rows for three module keys that had none. Undoing it means
-- removing exactly those rows and nothing else.
--
-- This is a DELETE, but not on business data: every row it removes was created
-- by 315 itself, the table holds permission configuration rather than records,
-- and the three modules provably had zero rows before 315 ran (that is the
-- entire premise of the migration). Re-running 315 restores them byte for byte.
--
-- WARNING: after this rolls back, `has_dynamic_permission` returns to its
-- legacy fallback for these three modules, which is WIDER than the seeded
-- rows — `view` opens to sales and viewer as well. Roll back only to unblock,
-- never as a resting state.
SET client_encoding='UTF8';

BEGIN;

DELETE FROM public.role_permissions
 WHERE module IN ('accounting', 'hr', 'market-rates');

DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.role_permissions
   WHERE module IN ('accounting', 'hr', 'market-rates');
  IF n <> 0 THEN RAISE EXCEPTION 'rollback incomplete: % rows remain', n; END IF;
END
$chk$;

COMMIT;
