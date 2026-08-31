BEGIN;
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

    -- DISTURBANCE 2: coalesce replaced by a bare now(). This is the mistake G5 exists to catch.
    IF new.status = 'accepted' THEN
      new.accepted_at := now();
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
DECLARE _c uuid; _hist timestamptz := '2026-03-14 09:15:00+03:30'; _v timestamptz;
BEGIN
  INSERT INTO public.sales_quotes (quote_number, customer_name, customer_phone)
  VALUES ('DIST2-417-C','gate','09120000003') RETURNING id INTO _c;
  UPDATE public.sales_quotes SET status='sent' WHERE id=_c;
  UPDATE public.sales_quotes SET status='accepted', accepted_at=_hist WHERE id=_c;
  SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_c;
  IF _v = _hist THEN
    RAISE EXCEPTION 'G5 stayed green under a bare now() -- G5 would be vacuous';
  ELSE
    RAISE NOTICE 'G5 RED    the historical value was overwritten with %  -- exactly what G5 catches', _v;
    RAISE NOTICE '          (this is why the migration uses coalesce, and why PR 2 can rely on it)';
  END IF;
END
$g$;
ROLLBACK;
