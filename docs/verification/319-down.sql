-- Down script for migration 319 (mutual settlement).
--
-- 319 was purely additive: one new table, three new functions. Nothing
-- pre-existing was replaced, so reverting removes rather than restores.
--
-- REFUSES TO RUN if any settlement has been posted. Dropping mutual_settlements
-- while rows exist would orphan the journal_entries whose source_id points at
-- them - posted ledger entries with no document behind them, which is worse
-- than leaving the feature in place. Unwinding posted settlements is an
-- accounting decision, not a migration one.
--
-- NO BEGIN / COMMIT here - transaction control belongs to the caller
-- (apply with psql --single-transaction -v ON_ERROR_STOP=1).
SET client_encoding='UTF8';

DO $guard$
DECLARE
  _rows bigint;
  _entries bigint;
BEGIN
  SELECT count(*) INTO _rows FROM public.mutual_settlements;
  SELECT count(*) INTO _entries FROM public.journal_entries WHERE source_type = 'mutual_settlement';

  IF _rows > 0 OR _entries > 0 THEN
    RAISE EXCEPTION
      'Refusing to revert 319: % settlement document(s) and % journal entr(y/ies) exist. Resolve them first.',
      _rows, _entries;
  END IF;
END
$guard$;

DROP FUNCTION IF EXISTS public.post_mutual_settlement(uuid,numeric,numeric,uuid,text,date);
DROP FUNCTION IF EXISTS public.list_mutual_settlement_candidates();
DROP FUNCTION IF EXISTS public.person_settlement_position(uuid);

DROP TABLE IF EXISTS public.mutual_settlements;

DO $$
BEGIN
  RAISE NOTICE '319 reverted: mutual settlement table and functions removed (no data existed).';
END $$;
