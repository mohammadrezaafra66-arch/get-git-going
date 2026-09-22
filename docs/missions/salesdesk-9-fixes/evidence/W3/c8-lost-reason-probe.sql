-- C8 lost-reason trigger probes (rolled back)
BEGIN;
DO $probe$
DECLARE
  v_id uuid;
  v_reason uuid;
  v_other uuid;
BEGIN
  SELECT id INTO v_id
    FROM public.sales_interactions
   WHERE kind = 'request' AND status = 'open'
   LIMIT 1;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'c8: no open request';
  END IF;

  SELECT id INTO v_reason FROM public.deal_lost_reasons
   WHERE title = U&'\0633\0627\06CC\0631' LIMIT 1;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'c8: seed سایر missing';
  END IF;
  v_other := v_reason; -- only seed is سایر; use it for both «سایر» cases

  -- 1) lost without reason → LOST_REASON_REQUIRED
  BEGIN
    UPDATE public.sales_interactions
       SET status = 'lost', lost_reason_id = NULL
     WHERE id = v_id;
    RAISE EXCEPTION 'c8 unexpected success without reason';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'LOST_REASON_REQUIRED' THEN RAISE; END IF;
      RAISE NOTICE 'C8_NO_REASON_OK %', SQLERRM;
  END;

  -- reset status if somehow changed (should not have)
  UPDATE public.sales_interactions SET status = 'open' WHERE id = v_id;

  -- 2) lost with «سایر» and empty other → LOST_REASON_REQUIRED
  BEGIN
    UPDATE public.sales_interactions
       SET status = 'lost',
           lost_reason_id = v_other,
           lost_reason_other = ''
     WHERE id = v_id;
    RAISE EXCEPTION 'c8 unexpected success سایر empty other';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'LOST_REASON_REQUIRED' THEN RAISE; END IF;
      RAISE NOTICE 'C8_SAIR_EMPTY_OK %', SQLERRM;
  END;

  UPDATE public.sales_interactions SET status = 'open', lost_reason_id = NULL, lost_reason_other = NULL WHERE id = v_id;

  -- 3) lost with «سایر» and non-empty other → OK
  UPDATE public.sales_interactions
     SET status = 'lost',
         lost_reason_id = v_other,
         lost_reason_other = 'probe-other'
   WHERE id = v_id;
  RAISE NOTICE 'C8_SAIR_WITH_OTHER_OK';

  -- reopen for cleanliness inside txn
  UPDATE public.sales_interactions
     SET status = 'open', lost_reason_id = NULL, lost_reason_other = NULL
   WHERE id = v_id;
END
$probe$;
ROLLBACK;
