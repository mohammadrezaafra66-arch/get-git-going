SET client_encoding='UTF8';

-- Test-DB only (afrakala / supabase_admin). Not a migration. Idempotent.
-- Deactivate leftover G8.9 pipelines whose title contains [TEST-DEAL]
-- and park their sort_order above the seed pipeline.

DO $pass3b$
DECLARE
  seed_sort integer;
  seed_hex text;
  expected_hex text := 'daa9d8a7d8b1db8cd8b220d8a7d981d8b1d8a7daa9d8a7d984d8a7';
  n integer;
BEGIN
  SELECT s.sort_order, encode(convert_to(s.title, 'UTF8'), 'hex')
    INTO seed_sort, seed_hex
    FROM public.sales_pipelines s
   WHERE s.title = 'کاریز افراکالا'
   ORDER BY s.sort_order
   LIMIT 1;

  IF seed_sort IS NULL THEN
    RAISE EXCEPTION 'seed pipeline not found';
  END IF;
  IF seed_hex IS DISTINCT FROM expected_hex THEN
    RAISE EXCEPTION 'seed title hex mismatch: % vs %', seed_hex, expected_hex;
  END IF;

  UPDATE public.sales_pipelines t
     SET is_active = false,
         sort_order = GREATEST(t.sort_order, seed_sort + 100)
   WHERE t.title LIKE '%[TEST-DEAL]%';

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'deactivated_or_parked=% seed_sort=%', n, seed_sort;
END
$pass3b$;

SELECT title,
       encode(convert_to(title, 'UTF8'), 'hex') AS title_hex,
       is_active,
       sort_order
  FROM public.sales_pipelines
 WHERE is_active
 ORDER BY sort_order, id
 LIMIT 1;

SELECT count(*) FILTER (WHERE title LIKE '%[TEST-DEAL]%' AND is_active) AS test_deal_active,
       count(*) FILTER (WHERE title LIKE '%[TEST-DEAL]%') AS test_deal_total
  FROM public.sales_pipelines;
