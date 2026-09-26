SET client_encoding='UTF8';

-- Test-DB only (afrakala). Not a migration. Idempotent.
-- Soft-delete leftover Playwright deal titles so the list 400-row cap
-- can show newly created Q7/Q8 rows. Does not touch [TEST-DIDAR-DEAL].

UPDATE public.sales_interactions
   SET deleted_at = COALESCE(deleted_at, now())
 WHERE kind = 'request'
   AND deleted_at IS NULL
   AND (
     title LIKE '[PASS3]%'
     OR title LIKE '[TEST-DEAL]%'
   );

SELECT count(*) FILTER (WHERE deleted_at IS NULL) AS live,
       count(*) FILTER (WHERE deleted_at IS NULL AND created_at >= date_trunc('month', now())) AS live_this_month
  FROM public.sales_interactions
 WHERE kind = 'request';
