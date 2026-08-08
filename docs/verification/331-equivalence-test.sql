SET client_encoding='UTF8';
\pset border 2

CREATE OR REPLACE FUNCTION pg_temp.probe331() RETURNS TABLE(probe text, result text)
LANGUAGE plpgsql AS $p$
DECLARE _cust uuid; _emp uuid; _t text;
BEGIN
  SELECT id INTO _cust FROM public.customers ORDER BY created_at LIMIT 1;
  SELECT user_id INTO _emp FROM public.user_roles WHERE role::text='admin' LIMIT 1;

  -- get_receivable_detail: row count + a stable checksum of the whole result set
  BEGIN
    SELECT count(*)::text || ' rows / md5=' || COALESCE(md5(string_agg(x::text, '|' ORDER BY x::text)), 'empty')
      INTO _t FROM public.get_receivable_detail(_cust, NULL) x;
    probe := 'get_receivable_detail(customer)'; result := _t; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    probe := 'get_receivable_detail(customer)'; result := 'ERROR: '||left(SQLERRM,70); RETURN NEXT;
  END;

  BEGIN
    SELECT count(*)::text || ' rows / md5=' || COALESCE(md5(string_agg(x::text, '|' ORDER BY x::text)), 'empty')
      INTO _t FROM public.get_receivable_detail(NULL, NULL) x;
    probe := 'get_receivable_detail(all)'; result := _t; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    probe := 'get_receivable_detail(all)'; result := 'ERROR: '||left(SQLERRM,70); RETURN NEXT;
  END;

  -- calculate_salesperson_collected_sales: the row-shape case
  BEGIN
    SELECT count(*)::text || ' row(s): ' || COALESCE(string_agg(x::text, ' ; '), '(none)')
      INTO _t FROM public.calculate_salesperson_collected_sales(_emp, 6) x;
    probe := 'collected_sales(admin,6)'; result := _t; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    probe := 'collected_sales(admin,6)'; result := 'ERROR: '||left(SQLERRM,70); RETURN NEXT;
  END;

  -- person_fk_drift_report
  BEGIN
    SELECT count(*)::text || ' rows: ' || COALESCE(string_agg(x::text, ' ; ' ORDER BY x::text), '(none)')
      INTO _t FROM public.person_fk_drift_report() x;
    probe := 'person_fk_drift_report'; result := _t; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    probe := 'person_fk_drift_report'; result := 'ERROR: '||left(SQLERRM,70); RETURN NEXT;
  END;

  -- recalculate_settlement_score / update_customer_overdue_status both write; call them
  -- and report the resulting profile row so a difference would show.
  BEGIN
    PERFORM public.update_customer_overdue_status(_cust);
    SELECT COALESCE(has_overdue::text,'null')||' / '||COALESCE(overdue_since::text,'null')
      INTO _t FROM public.customer_credit_profile WHERE customer_id=_cust;
    probe := 'overdue_status(customer)'; result := COALESCE(_t,'(no profile row)'); RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    probe := 'overdue_status(customer)'; result := 'ERROR: '||left(SQLERRM,70); RETURN NEXT;
  END;
END $p$;

\echo '################ OLD ################'
BEGIN;
SET LOCAL "request.jwt.claims" = '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}';
SELECT * FROM pg_temp.probe331();
ROLLBACK;

\echo '################ NEW (331 applied in-txn) ################'
BEGIN;
\i /tmp/mig331.sql
SET LOCAL "request.jwt.claims" = '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}';
SELECT * FROM pg_temp.probe331();
ROLLBACK;
