SET client_encoding='UTF8';

-- 449 (B-6): retire the daily-capital entry trio. Owner answered "No" to daily
-- capital entry, so these three RPCs are declined, not merely unused.
--
--   can_use_customer_capital_allocation(uuid, numeric)
--   upsert_daily_capital_input(date, numeric x11, text)
--   save_daily_capital_snapshot(date)
--
-- THE TABLES ARE DELIBERATELY LEFT ALONE. This migration drops FUNCTIONS ONLY:
--   public.daily_capital_snapshots  holds 10 rows  -- KEPT
--   public.daily_capital_inputs     holds  2 rows  -- KEPT
-- Dropping data is a stop condition for this role; the owner declined the
-- feature, not the history it already wrote.
--
-- Zero-reference verified 2026-09-05 across all four frontend call idioms and
-- every database catalogue in every schema. No CASCADE.

DROP FUNCTION public.can_use_customer_capital_allocation(uuid, numeric);
DROP FUNCTION public.upsert_daily_capital_input(
  date, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, text);
DROP FUNCTION public.save_daily_capital_snapshot(date);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname IN
    ('can_use_customer_capital_allocation','upsert_daily_capital_input',
     'save_daily_capital_snapshot');
  IF n <> 0 THEN RAISE EXCEPTION '449: expected 0 remaining, found %', n; END IF;

  -- the data these functions wrote must be untouched
  SELECT count(*) INTO n FROM public.daily_capital_snapshots;
  IF n <> 10 THEN RAISE EXCEPTION '449: daily_capital_snapshots expected 10 rows, found %', n; END IF;
  SELECT count(*) INTO n FROM public.daily_capital_inputs;
  IF n <> 2 THEN RAISE EXCEPTION '449: daily_capital_inputs expected 2 rows, found %', n; END IF;
END $$;
