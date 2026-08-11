-- Down script for migration 310 (P2.1c - propagation safety).
--
-- 310 replaced two trigger functions and recreated one trigger to add DELETE to
-- its event list. It added no column, constraint or index.
--
-- REVERTING RE-OPENS TWO REAL DEFECTS. Do not roll this back casually:
--   1. Deleting a person_identifiers row stops clearing the mirror, so a mirror
--      can again hold a code no identifier backs. That is what left the real
--      supplier صباح روشناس carrying the test code 99900001.
--   2. Propagation goes back to raising on a mirror unique-index conflict,
--      aborting whatever transaction happened to write the identifier. That is
--      what broke e2e/asan/export-purchase.spec.ts:408, a spec unrelated to the
--      Asan code feature.
--
-- The pre-310 definition is snapshotted at
-- docs/verification/pre-310/trg_person_identifiers_propagate_asan_code.live.sql
-- if the exact previous body is needed.
--
-- DATA NOTE. 310 also nulled mirror codes that had no identifier behind them
-- (one row on this database). That cleanup is not undone here: restoring an
-- unbacked test code onto a real supplier would be restoring the bug.
--
-- NO BEGIN / COMMIT here - transaction control belongs to the caller
-- (apply with psql --single-transaction -v ON_ERROR_STOP=1).
SET client_encoding='UTF8';

-- Restore 308's INSERT/UPDATE-only event list.
DROP TRIGGER IF EXISTS trg_person_identifiers_propagate_asan_code ON public.person_identifiers;
CREATE TRIGGER trg_person_identifiers_propagate_asan_code
  AFTER INSERT OR UPDATE OF value_raw, value_normalized, status, person_id
  ON public.person_identifiers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_person_identifiers_propagate_asan_code();

DO $$
BEGIN
  RAISE NOTICE 'Trigger event list reverted to 308. The FUNCTION bodies still carry';
  RAISE NOTICE '310s conflict-safety; restore them from docs/verification/pre-310/';
  RAISE NOTICE 'only if the raising behaviour is genuinely wanted back.';
END $$;
