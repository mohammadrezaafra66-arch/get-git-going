BEGIN;
-- DISTURBANCE: restore the PRE-417 trigger (no accepted branch), then re-run the two assertions
-- that matter. Both must go red. Everything is rolled back.
CREATE OR REPLACE FUNCTION public.sales_quotes_validate_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (tg_op = 'UPDATE' AND old.status IS DISTINCT FROM new.status) THEN
    -- Final states cannot be changed
    IF old.status IN ('accepted','rejected','canceled') THEN
      RAISE EXCEPTION 'cannot change status of a finalized quote (%, %)', old.quote_number, old.status
        USING ERRCODE = '22023';
    END IF;
    -- Allowed transitions
    IF NOT (
      (old.status = 'draft' AND new.status IN ('sent','canceled'))
      OR (old.status = 'sent' AND new.status IN ('accepted','rejected','canceled'))
    ) THEN
      RAISE EXCEPTION 'invalid status transition: % -> %', old.status, new.status
        USING ERRCODE = '22023';
    END IF;

    IF new.status = 'canceled' THEN
      new.canceled_at := coalesce(new.canceled_at, now());
      new.canceled_by := coalesce(new.canceled_by, auth.uid());
    END IF;
  END IF;
  RETURN new;
END;
$function$;

DO $g$
DECLARE
  _a uuid; _c uuid; _hist timestamptz := '2026-03-14 09:15:00+03:30'; _v timestamptz;
  _red int := 0;
BEGIN
  INSERT INTO public.sales_quotes (quote_number, customer_name, customer_phone)
  VALUES ('DIST-417-A','gate','09120000001') RETURNING id INTO _a;
  INSERT INTO public.sales_quotes (quote_number, customer_name, customer_phone)
  VALUES ('DIST-417-C','gate','09120000003') RETURNING id INTO _c;
  UPDATE public.sales_quotes SET status='sent' WHERE id IN (_a,_c);

  UPDATE public.sales_quotes SET status='accepted' WHERE id=_a;
  SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_a;
  IF _v IS NULL THEN _red:=_red+1;
    RAISE NOTICE 'G3 RED    sent->accepted did NOT stamp (accepted_at = NULL) -- gate catches it';
  ELSE RAISE NOTICE 'G3 still green?! %', _v; END IF;

  UPDATE public.sales_quotes SET status='accepted', accepted_at=_hist WHERE id=_c;
  SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_c;
  IF _v = _hist THEN
    RAISE NOTICE 'G5 still green: an explicit value is written by the UPDATE itself, not the trigger';
  ELSE _red:=_red+1; RAISE NOTICE 'G5 RED    %', COALESCE(_v::text,'NULL'); END IF;

  RAISE NOTICE '---- DISTURBED: % assertion(s) went red (want at least 1) ----', _red;
  IF _red = 0 THEN RAISE EXCEPTION 'DISTURBANCE PROVED NOTHING - the gate is vacuous'; END IF;
END
$g$;
ROLLBACK;
