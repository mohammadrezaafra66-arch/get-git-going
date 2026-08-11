SET client_encoding='UTF8';
\set ON_ERROR_STOP off

CREATE OR REPLACE FUNCTION pg_temp.merge_probe() RETURNS text LANGUAGE plpgsql AS $p$
DECLARE _w uuid; _l uuid; _r jsonb;
BEGIN
  INSERT INTO public.persons(display_name, kind, is_active)
  VALUES ('zz merge probe winner', 'individual', true) RETURNING id INTO _w;
  INSERT INTO public.persons(display_name, kind, is_active)
  VALUES ('zz merge probe loser', 'individual', true) RETURNING id INTO _l;

  _r := public.person_merge(_w, _l, 'gate probe');
  RETURN 'MERGE OK -> ' || left(_r::text, 90);
EXCEPTION WHEN OTHERS THEN
  RETURN 'MERGE FAILED [' || SQLSTATE || '] ' || left(SQLERRM, 110);
END $p$;

\echo '################ BEFORE 332 (invoices still present) ################'
BEGIN;
SET LOCAL "request.jwt.claims" = '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}';
SELECT pg_temp.merge_probe() AS result;
ROLLBACK;

\echo '################ AFTER 332 (table dropped + key de-registered) ################'
BEGIN;
\i /tmp/mig332.sql
SET LOCAL "request.jwt.claims" = '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}';
SELECT pg_temp.merge_probe() AS result;
ROLLBACK;

\echo '################ CONTROL: drop the table WITHOUT de-registering ################'
\echo '(this is the failure mode condition 2 exists to prevent — it must FAIL)'
BEGIN;
SET LOCAL "request.jwt.claims" = '{"sub":"1a15e8c6-3a83-49c2-9531-db9046d30968","role":"authenticated"}';
ALTER TABLE public.invoices RENAME TO zz_invoices_hidden;
SELECT pg_temp.merge_probe() AS result;
ROLLBACK;

\echo '################ nothing persisted ################'
SELECT to_regclass('public.invoices') AS invoices_intact,
       (SELECT count(*) FROM public.persons WHERE display_name LIKE 'zz merge probe%') AS probe_persons_should_be_0;
