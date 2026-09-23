-- C7 probe: status flip sets/clears won_at / lost_at (rolled back)
BEGIN;
DO $probe$
DECLARE
  v_id uuid;
  v_won timestamptz;
  v_lost timestamptz;
BEGIN
  SELECT id INTO v_id
    FROM public.sales_interactions
   WHERE kind = 'request' AND status = 'open'
   LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'c7 probe: no open request';
  END IF;

  UPDATE public.sales_interactions SET status = 'won' WHERE id = v_id;
  SELECT won_at, lost_at INTO v_won, v_lost FROM public.sales_interactions WHERE id = v_id;
  IF v_won IS NULL OR v_lost IS NOT NULL THEN
    RAISE EXCEPTION 'c7 won fail won_at=% lost_at=%', v_won, v_lost;
  END IF;
  RAISE NOTICE 'C7_WON_OK won_at=% lost_at=%', v_won, v_lost;

  UPDATE public.sales_interactions SET status = 'lost' WHERE id = v_id;
  SELECT won_at, lost_at INTO v_won, v_lost FROM public.sales_interactions WHERE id = v_id;
  IF v_lost IS NULL OR v_won IS NOT NULL THEN
    RAISE EXCEPTION 'c7 lost fail won_at=% lost_at=%', v_won, v_lost;
  END IF;
  RAISE NOTICE 'C7_LOST_OK won_at=% lost_at=%', v_won, v_lost;

  UPDATE public.sales_interactions SET status = 'open' WHERE id = v_id;
  SELECT won_at, lost_at INTO v_won, v_lost FROM public.sales_interactions WHERE id = v_id;
  IF v_won IS NOT NULL OR v_lost IS NOT NULL THEN
    RAISE EXCEPTION 'c7 open fail won_at=% lost_at=%', v_won, v_lost;
  END IF;
  RAISE NOTICE 'C7_OPEN_OK won_at=% lost_at=%', v_won, v_lost;
END
$probe$;
ROLLBACK;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='sales_interactions'
  AND column_name IN ('won_at','lost_at')
ORDER BY 1;
