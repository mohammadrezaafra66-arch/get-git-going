-- Rollback for migration 317 (polymorphic reference integrity).
--
-- Drops the two validation triggers, their functions, and the diagnostic.
-- No data is touched: 317 only ever rejected writes, it never wrote anything.
--
-- WARNING: after this rolls back, `stock_movements.ref_id` and
-- `journal_lines.account_ref_id` accept any uuid again, including one that
-- points at nothing. Roll back only to unblock a write path, and fix forward.
SET client_encoding='UTF8';

BEGIN;

DROP TRIGGER IF EXISTS trg_validate_stock_movement_ref ON public.stock_movements;
DROP TRIGGER IF EXISTS trg_validate_journal_line_ref  ON public.journal_lines;

DROP FUNCTION IF EXISTS public.validate_stock_movement_ref();
DROP FUNCTION IF EXISTS public.validate_journal_line_ref();
DROP FUNCTION IF EXISTS public.polymorphic_ref_orphan_report();

DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgname IN ('trg_validate_stock_movement_ref', 'trg_validate_journal_line_ref')
     AND NOT tgisinternal;
  IF n <> 0 THEN RAISE EXCEPTION 'rollback incomplete: % triggers remain', n; END IF;
END
$chk$;

COMMIT;
