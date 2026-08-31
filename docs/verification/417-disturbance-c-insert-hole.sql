BEGIN;
-- DISTURBANCE C: put the trigger back to BEFORE UPDATE only, leaving the function untouched.
-- G7 must go red; G3 must stay green -- which is what makes this disturbance specific.
CREATE OR REPLACE TRIGGER trg_sales_quotes_validate_status
  BEFORE UPDATE ON public.sales_quotes
  FOR EACH ROW EXECUTE FUNCTION public.sales_quotes_validate_status();

DO $g$
DECLARE _d uuid; _a uuid; _v timestamptz; _red int := 0;
BEGIN
  INSERT INTO public.sales_quotes (quote_number, customer_name, customer_phone, status)
  VALUES ('DISTC-D','gate','09120000004','accepted') RETURNING id INTO _d;
  SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_d;
  IF _v IS NULL THEN _red:=_red+1;
    RAISE NOTICE 'G7 RED    born accepted via INSERT -> accepted_at NULL (the hole is back)';
  ELSE RAISE NOTICE 'G7 still green?! %', _v; END IF;

  -- and the repair really is impossible
  BEGIN
    UPDATE public.sales_quotes SET status='accepted' WHERE id=_d;
    SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_d;
    RAISE NOTICE '          repair attempt -> % (not DISTINCT, branch never runs)', COALESCE(_v::text,'NULL');
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE '          repair raised: %', left(SQLERRM,50); END;

  INSERT INTO public.sales_quotes (quote_number, customer_name, customer_phone)
  VALUES ('DISTC-A','gate','09120000001') RETURNING id INTO _a;
  UPDATE public.sales_quotes SET status='sent' WHERE id=_a;
  UPDATE public.sales_quotes SET status='accepted' WHERE id=_a;
  SELECT accepted_at INTO _v FROM public.sales_quotes WHERE id=_a;
  IF _v IS NOT NULL THEN RAISE NOTICE 'G3 still green: % (disturbance is specific to INSERT)', _v;
  ELSE _red:=_red+1; RAISE NOTICE 'G3 RED too -- disturbance was not specific'; END IF;

  RAISE NOTICE '---- DISTURBED C: % red (want exactly G7) ----', _red;
  IF _red = 0 THEN RAISE EXCEPTION 'G7 IS VACUOUS'; END IF;
END
$g$;
ROLLBACK;
