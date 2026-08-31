BEGIN;
DO $g$
DECLARE
  _a uuid; _b uuid; _c uuid;
  _hist timestamptz := '2026-03-14 09:15:00+03:30';
  _v timestamptz; _n int; _pass int := 0; _fail int := 0;
BEGIN
  -- Synthetic fixtures, born 'draft' by column default. No items, so the AFTER stock-out trigger
  -- has nothing to reserve -- the real 'sent' quotes could not be used because accepting one of
  -- them legitimately raises "موجودی کافی نیست", which is a different trigger doing its job.
  INSERT INTO public.sales_quotes (quote_number, customer_name, customer_phone)
  VALUES ('GATE-417-A','gate','09120000001') RETURNING id INTO _a;
  INSERT INTO public.sales_quotes (quote_number, customer_name, customer_phone)
  VALUES ('GATE-417-B','gate','09120000002') RETURNING id INTO _b;
  INSERT INTO public.sales_quotes (quote_number, customer_name, customer_phone)
  VALUES ('GATE-417-C','gate','09120000003') RETURNING id INTO _c;

  -- G0: PR 1 backfills nothing.
  SELECT count(*) INTO _n FROM public.sales_quotes
   WHERE status='accepted' AND accepted_at IS NULL AND quote_number NOT LIKE 'GATE-417-%';
  IF _n = 9 THEN _pass:=_pass+1; RAISE NOTICE 'G0 PASS  the 9 pre-existing accepted rows are still NULL';
  ELSE _fail:=_fail+1; RAISE NOTICE 'G0 FAIL  expected 9 NULL, got %', _n; END IF;

  -- G1: a fresh row is born with accepted_at NULL.
  SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_a;
  IF _v IS NULL THEN _pass:=_pass+1; RAISE NOTICE 'G1 PASS  a new draft has accepted_at NULL';
  ELSE _fail:=_fail+1; RAISE NOTICE 'G1 FAIL  new draft already had %', _v; END IF;

  -- G2: draft -> sent must NOT stamp.
  UPDATE public.sales_quotes SET status='sent' WHERE id IN (_a,_b,_c);
  SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_a;
  IF _v IS NULL THEN _pass:=_pass+1; RAISE NOTICE 'G2 PASS  draft->sent left accepted_at NULL';
  ELSE _fail:=_fail+1; RAISE NOTICE 'G2 FAIL  sent row got %', _v; END IF;

  -- G3: sent -> accepted STAMPS, and with a plausible clock value.
  UPDATE public.sales_quotes SET status='accepted' WHERE id=_a;
  SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_a;
  IF _v IS NOT NULL AND _v BETWEEN now()-interval '1 minute' AND now()+interval '1 minute' THEN
    _pass:=_pass+1; RAISE NOTICE 'G3 PASS  sent->accepted stamped %', _v;
  ELSE _fail:=_fail+1; RAISE NOTICE 'G3 FAIL  accepted_at = %', COALESCE(_v::text,'NULL'); END IF;

  -- G4: sent -> rejected must NOT stamp. Non-vacuous: proves G3 is about 'accepted', not about
  -- "any status change".
  UPDATE public.sales_quotes SET status='rejected', reject_reason='gate' WHERE id=_b;
  SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_b;
  IF _v IS NULL THEN _pass:=_pass+1; RAISE NOTICE 'G4 PASS  sent->rejected left accepted_at NULL';
  ELSE _fail:=_fail+1; RAISE NOTICE 'G4 FAIL  rejected row got %', _v; END IF;

  -- G5: coalesce -- an explicit historical value must SURVIVE. PR 2's backfill depends on this.
  UPDATE public.sales_quotes SET status='accepted', accepted_at=_hist WHERE id=_c;
  SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_c;
  IF _v = _hist THEN _pass:=_pass+1; RAISE NOTICE 'G5 PASS  explicit historical value survived: %', _v;
  ELSE _fail:=_fail+1; RAISE NOTICE 'G5 FAIL  expected % got %', _hist, COALESCE(_v::text,'NULL'); END IF;

  -- G6: the pre-existing guard still works -- a finalized quote cannot change status.
  BEGIN
    UPDATE public.sales_quotes SET status='sent' WHERE id=_a;
    _fail:=_fail+1; RAISE NOTICE 'G6 FAIL  a finalized quote was allowed to change status';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%finalized quote%' THEN _pass:=_pass+1;
      RAISE NOTICE 'G6 PASS  the pre-existing finalized-quote guard survived the rewrite';
    ELSE _fail:=_fail+1; RAISE NOTICE 'G6 FAIL  wrong error: %', left(SQLERRM,60); END IF;
  END;

  -- G7: THE HOLE. A quote INSERTed directly as 'accepted' never passes through the transition
  -- logic. Before the trigger was widened to BEFORE INSERT OR UPDATE this left accepted_at NULL,
  -- and unrepairably so -- re-asserting the same status is not DISTINCT, so no later UPDATE could
  -- ever stamp it. `authenticated` holds an INSERT grant and the RLS policy does not constrain
  -- status, so this is an ordinary user's reach, and committed e2e fixtures already do it.
  DECLARE _d uuid; BEGIN
    INSERT INTO public.sales_quotes (quote_number, customer_name, customer_phone, status)
    VALUES ('GATE-417-D','gate','09120000004','accepted') RETURNING id INTO _d;
    SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_d;
    IF _v IS NOT NULL AND _v BETWEEN now()-interval '1 minute' AND now()+interval '1 minute' THEN
      _pass:=_pass+1; RAISE NOTICE 'G7 PASS  born accepted via INSERT -> stamped %', _v;
    ELSE _fail:=_fail+1; RAISE NOTICE 'G7 FAIL  born accepted via INSERT -> accepted_at = %',
      COALESCE(_v::text,'NULL'); END IF;

    -- G8: an INSERT that is NOT accepted must not be stamped. Non-vacuous partner to G7.
    INSERT INTO public.sales_quotes (quote_number, customer_name, customer_phone, status)
    VALUES ('GATE-417-E','gate','09120000005','draft') RETURNING id INTO _d;
    SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_d;
    IF _v IS NULL THEN _pass:=_pass+1; RAISE NOTICE 'G8 PASS  born draft via INSERT -> still NULL';
    ELSE _fail:=_fail+1; RAISE NOTICE 'G8 FAIL  draft insert got %', _v; END IF;
  END;

  RAISE NOTICE '---- GATE 417: % passed, % failed ----', _pass, _fail;
  IF _fail > 0 THEN RAISE EXCEPTION 'GATE 417 IS RED'; END IF;
END
$g$;
ROLLBACK;
