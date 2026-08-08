SET client_encoding='UTF8';
\set RCPT '''fd8194a5-62db-4e13-9852-6a27ee00612c'''
\set QUOTE '''fd274e79-6880-4f3c-88b3-1cb2520337bc'''

-- Three probes, run identically against the OLD and the NEW definitions.
--   A) a legitimate quote allocation, well inside both caps  -> must be ACCEPTED
--   B) an allocation larger than the receipt itself          -> must be REJECTED (rule 1)
--   C) an invoice-linked allocation                          -> must be REJECTED either way
CREATE OR REPLACE FUNCTION pg_temp.probe() RETURNS TABLE(probe text, outcome text)
LANGUAGE plpgsql AS $p$
DECLARE _e text;
BEGIN
  BEGIN
    INSERT INTO public.payment_receipt_links(receipt_id, quote_id, amount)
    VALUES ('fd8194a5-62db-4e13-9852-6a27ee00612c', 'fd274e79-6880-4f3c-88b3-1cb2520337bc', 1000000);
    probe := 'A valid quote allocation'; outcome := 'ACCEPTED'; RETURN NEXT;
    DELETE FROM public.payment_receipt_links
     WHERE receipt_id='fd8194a5-62db-4e13-9852-6a27ee00612c' AND amount=1000000;
  EXCEPTION WHEN OTHERS THEN
    probe := 'A valid quote allocation'; outcome := 'REJECTED: '||left(SQLERRM,60); RETURN NEXT;
  END;

  BEGIN
    INSERT INTO public.payment_receipt_links(receipt_id, quote_id, amount)
    VALUES ('fd8194a5-62db-4e13-9852-6a27ee00612c', 'fd274e79-6880-4f3c-88b3-1cb2520337bc', 20000000000);
    probe := 'B over receipt amount'; outcome := 'ACCEPTED (BAD!)'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    probe := 'B over receipt amount'; outcome := 'REJECTED ['||SQLSTATE||'] '||left(SQLERRM,55); RETURN NEXT;
  END;

  BEGIN
    INSERT INTO public.payment_receipt_links(receipt_id, invoice_id, amount)
    VALUES ('fd8194a5-62db-4e13-9852-6a27ee00612c', gen_random_uuid(), 1000000);
    probe := 'C invoice-linked'; outcome := 'ACCEPTED (BAD!)'; RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    probe := 'C invoice-linked'; outcome := 'REJECTED ['||SQLSTATE||'] '||left(SQLERRM,55); RETURN NEXT;
  END;
END $p$;

\echo '################ OLD definitions ################'
BEGIN;
SELECT * FROM pg_temp.probe();
ROLLBACK;

\echo '################ NEW definitions (330 applied in-txn) ################'
BEGIN;
\i /tmp/mig330.sql
SELECT * FROM pg_temp.probe();
ROLLBACK;

\echo '################ nothing persisted ################'
SELECT count(*) AS links_still_3 FROM public.payment_receipt_links;
