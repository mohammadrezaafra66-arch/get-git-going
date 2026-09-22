-- After C2: INSERT request with salesperson_id NULL must FAIL RESPONSIBLE_REQUIRED
BEGIN;
DO $probe$
DECLARE
  v_person uuid;
  v_author uuid;
BEGIN
  SELECT id INTO v_person FROM public.persons LIMIT 1;
  SELECT id INTO v_author FROM public.profiles LIMIT 1;

  BEGIN
    INSERT INTO public.sales_interactions (
      person_id, kind, body, author_id, salesperson_id, status, source
    ) VALUES (
      v_person, 'request', 'c2-after-probe', v_author, NULL, 'open', 'manual'
    );
    RAISE EXCEPTION 'C2_AFTER_UNEXPECTED_SUCCESS';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'RESPONSIBLE_REQUIRED' THEN
        RAISE NOTICE 'C2_AFTER_INSERT_FAIL_OK message=%', SQLERRM;
      ELSE
        RAISE;
      END IF;
  END;

  -- UPDATE clearing salesperson on existing request must also fail
  BEGIN
    UPDATE public.sales_interactions
       SET salesperson_id = NULL
     WHERE id IN (
       SELECT id FROM public.sales_interactions
        WHERE kind = 'request' AND salesperson_id IS NOT NULL
        LIMIT 1
     );
    RAISE EXCEPTION 'C2_AFTER_UPDATE_UNEXPECTED_SUCCESS';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'RESPONSIBLE_REQUIRED' THEN
        RAISE NOTICE 'C2_AFTER_UPDATE_FAIL_OK message=%', SQLERRM;
      ELSE
        RAISE;
      END IF;
  END;
END
$probe$;
ROLLBACK;

-- Backfill verification
SELECT count(*) AS still_null_request
FROM public.sales_interactions
WHERE salesperson_id IS NULL AND kind = 'request';

SELECT count(*) AS snapshot_rows FROM public._mig_565_salesperson_null_ids;
