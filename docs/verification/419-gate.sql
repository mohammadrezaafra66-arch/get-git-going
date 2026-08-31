-- Gate for migration 419 -- the receivables due date.
-- Run:  psql -U supabase_admin -d afrakala -f 419-gate.sql
-- Everything happens inside BEGIN ... ROLLBACK. Nothing is written.
BEGIN;
SET LOCAL request.jwt.claims = '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}';

DO $g$
DECLARE
  _pass int := 0; _fail int := 0;
  _n int; _d date; _txt text; _flag boolean; _def text;
  _q uuid; _st uuid;
BEGIN
  -- G1: the view must not reference expires_at at all any more.
  SELECT pg_get_viewdef('public.vw_customer_receivables'::regclass, true) INTO _def;
  IF _def NOT LIKE '%expires_at%' AND _def LIKE '%accepted_at%' AND _def LIKE '%settlement_types%' THEN
    _pass:=_pass+1; RAISE NOTICE 'G1 PASS  due date comes from accepted_at + settlement_types, not expires_at';
  ELSE _fail:=_fail+1; RAISE NOTICE 'G1 FAIL  the view still derives from expires_at'; END IF;

  -- G2: every row with a usable settlement type now has a due date.
  SELECT count(*) INTO _n FROM public.vw_customer_receivables WHERE due_date IS NOT NULL;
  IF _n = 7 THEN _pass:=_pass+1; RAISE NOTICE 'G2 PASS  % of 8 rows have a real due date (was 0 before 419)', _n;
  ELSE _fail:=_fail+1; RAISE NOTICE 'G2 FAIL  expected 7 dated rows, got %', _n; END IF;

  -- G3: the date is exactly accepted_at + days, per row. Arithmetic, not a spot check.
  SELECT count(*) INTO _n
  FROM public.vw_customer_receivables v
  JOIN public.sales_quotes q ON q.id = v.invoice_id
  JOIN public.settlement_types st ON st.id = q.settlement_type_id
  WHERE v.due_date IS NOT NULL
    AND v.due_date <> (q.accepted_at + ((st.days || ' days')::interval))::date;
  IF _n = 0 THEN _pass:=_pass+1; RAISE NOTICE 'G3 PASS  every due date equals accepted_at + settlement days';
  ELSE _fail:=_fail+1; RAISE NOTICE 'G3 FAIL  % rows disagree with the arithmetic', _n; END IF;

  -- G4: overdue now actually fires. Before 419 it was false on every row.
  SELECT count(*) INTO _n FROM public.vw_customer_receivables WHERE is_overdue;
  IF _n > 0 THEN _pass:=_pass+1; RAISE NOTICE 'G4 PASS  % rows are overdue (was 0 for every row before 419)', _n;
  ELSE _fail:=_fail+1; RAISE NOTICE 'G4 FAIL  nothing is overdue, which is what the bug looked like'; END IF;

  -- G5: the owner's rule -- inactive AND days=0 gets NO date, with a reason.
  SELECT due_date, due_date_unknown_reason INTO _d, _txt
  FROM public.vw_customer_receivables WHERE invoice_number='SQ-2026-000005';
  IF _d IS NULL AND _txt = 'inactive_zero_days' THEN
    _pass:=_pass+1; RAISE NOTICE 'G5 PASS  inactive+days=0 withholds the date, reason=%', _txt;
  ELSE _fail:=_fail+1; RAISE NOTICE 'G5 FAIL  got due_date=% reason=%', _d, _txt; END IF;

  -- G6: and it is excluded from overdue, not merely undated.
  SELECT is_overdue INTO _flag FROM public.vw_customer_receivables WHERE invoice_number='SQ-2026-000005';
  IF _flag IS FALSE THEN _pass:=_pass+1; RAISE NOTICE 'G6 PASS  the undated row is excluded from overdue';
  ELSE _fail:=_fail+1; RAISE NOTICE 'G6 FAIL  an undated row was marked overdue'; END IF;

  -- G7: SYNTHETIC. inactive AND days>0 -> date IS shown, and flagged. No live instance exists,
  -- so the branch is unreachable by observation and has to be created to be tested at all.
  SELECT q.id, q.settlement_type_id INTO _q, _st
  FROM public.sales_quotes q WHERE q.quote_number='SQ-2026-000005';
  UPDATE public.settlement_types SET days = 3 WHERE id = _st;   -- still inactive, now days>0
  SELECT due_date, settlement_inactive_flag, due_date_unknown_reason INTO _d, _flag, _txt
  FROM public.vw_customer_receivables WHERE invoice_number='SQ-2026-000005';
  IF _d IS NOT NULL AND _flag IS TRUE AND _txt IS NULL THEN
    _pass:=_pass+1; RAISE NOTICE 'G7 PASS  inactive+days=3 -> due_date=% and flagged', _d;
  ELSE _fail:=_fail+1; RAISE NOTICE 'G7 FAIL  due_date=% flag=% reason=%', _d, _flag, _txt; END IF;
  UPDATE public.settlement_types SET days = 0 WHERE id = _st;   -- put it back within the txn

  -- G8: SYNTHETIC. accepted_at NULL -> no date, reason no_accepted_at. Structurally unreachable
  -- since 417/418, so this is a guarantee rather than a live case.
  SELECT id INTO _q FROM public.sales_quotes WHERE quote_number='SQ-2026-000004';
  UPDATE public.sales_quotes SET accepted_at = NULL WHERE id = _q;
  SELECT due_date, due_date_unknown_reason INTO _d, _txt
  FROM public.vw_customer_receivables WHERE invoice_number='SQ-2026-000004';
  IF _d IS NULL AND _txt = 'no_accepted_at' THEN
    _pass:=_pass+1; RAISE NOTICE 'G8 PASS  a missing accepted_at withholds the date, reason=%', _txt;
  ELSE _fail:=_fail+1; RAISE NOTICE 'G8 FAIL  due_date=% reason=%', _d, _txt; END IF;

  -- G9: active AND days=0 keeps a normal date and NO flag -- the case that must NOT be marked.
  SELECT due_date, settlement_inactive_flag INTO _d, _flag
  FROM public.vw_customer_receivables WHERE invoice_number='SQ-2026-000024';
  IF _d IS NOT NULL AND _flag IS FALSE THEN
    _pass:=_pass+1; RAISE NOTICE 'G9 PASS  active+days=0 is a normal dated row, unflagged (%)', _d;
  ELSE _fail:=_fail+1; RAISE NOTICE 'G9 FAIL  due_date=% flag=%', _d, _flag; END IF;

  RAISE NOTICE '---- GATE 419: % passed, % failed ----', _pass, _fail;
  IF _fail > 0 THEN RAISE EXCEPTION 'GATE 419 IS RED'; END IF;
END
$g$;
ROLLBACK;
