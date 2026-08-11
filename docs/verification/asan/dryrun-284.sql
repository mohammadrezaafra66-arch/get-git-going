SET client_encoding='UTF8';
BEGIN;
\i /tmp/mig284.sql

SELECT 'collisions_detected' AS check, count(*)::text AS n FROM public.phone_collisions;
SELECT 'collision_rows' AS check, normalized_phone || ' -> ' || jsonb_array_length(entity_refs)::text AS n
  FROM public.phone_collisions ORDER BY normalized_phone;

-- the normalizer must handle every format R2.3 named
SELECT 'norm' AS check, src || ' => ' || coalesce(public.normalize_phone_local(src), '<null>') AS n
  FROM (VALUES
    ('09123740712'),          -- already canonical
    ('9123740712'),           -- missing leading zero
    ('+989123740712'),        -- E.164
    ('00989123740712'),       -- international 00
    ('0912 374 0712'),        -- spaces
    ('0912-374-0712'),        -- dashes
    ('(0912)3740712'),        -- parentheses
    ('۰۹۱۲۳۷۴۰۷۱۲'),          -- Persian digits
    ('٠٩١٢٣٧٤٠٧١٢'),          -- Arabic-Indic digits
    ('02133445566'),          -- landline: keeps its area code
    ('not a phone')           -- unparseable: returned unchanged
  ) AS t(src);

-- the trigger must fire on a direct INSERT, not just through the app
SAVEPOINT s1;
INSERT INTO public.visitors (full_name, phone) VALUES ('QA-284-trigger', ' ۰۹۱۲۹۹۹۸۸۷۷ ');
SELECT 'trigger_insert' AS check, phone AS n FROM public.visitors WHERE full_name = 'QA-284-trigger';
UPDATE public.visitors SET phone = '+989121112233' WHERE full_name = 'QA-284-trigger';
SELECT 'trigger_update' AS check, phone AS n FROM public.visitors WHERE full_name = 'QA-284-trigger';
ROLLBACK TO SAVEPOINT s1;

-- a collision must be QUEUED, never merged
SAVEPOINT s2;
DO $$
DECLARE before_n integer; after_n integer; queued integer;
BEGIN
  SELECT count(*) INTO before_n FROM public.visitors;
  INSERT INTO public.visitors (full_name, phone) VALUES ('QA-284-a', '09150001122');
  INSERT INTO public.visitors (full_name, phone) VALUES ('QA-284-b', '۰۹۱۵۰۰۰۱۱۲۲');
  SELECT count(*) INTO after_n FROM public.visitors;
  IF after_n <> before_n + 2 THEN
    RAISE EXCEPTION 'FAIL: rows were merged or rejected (% -> %)', before_n, after_n;
  END IF;
  PERFORM public.detect_phone_collisions();
  SELECT count(*) INTO queued FROM public.phone_collisions
   WHERE normalized_phone = '09150001122' AND status = 'pending';
  IF queued <> 1 THEN RAISE EXCEPTION 'FAIL: collision not queued (found %)', queued; END IF;
  RAISE NOTICE 'PASS: both rows survive, collision queued, nothing merged';
END $$;
ROLLBACK TO SAVEPOINT s2;

ROLLBACK;
