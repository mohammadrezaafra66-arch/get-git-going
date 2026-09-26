SET client_encoding TO 'UTF8';
SELECT id, status, products_attempted, products_succeeded, products_failed, products_skipped, skip_reasons
FROM public.torob_eye_runs
WHERE id = '27ffbd97-5b9e-4896-9fb9-57aa7bea93d3';

SELECT count(*) AS snaps_this_run
  FROM public.torob_offer_snapshots
 WHERE run_id = '27ffbd97-5b9e-4896-9fb9-57aa7bea93d3';

SELECT p.id, p.name, p.torob_url
  FROM public.products p
 WHERE p.id = '41464c40-1bf7-4909-bc2e-4eeadaf02613';

SELECT a.assigned_at, a.product_id, p.name, a.url AS assigned_url, a.score, a.assigned, a.reasons
  FROM public.torob_link_assignments a
  JOIN public.products p ON p.id = a.product_id
 ORDER BY a.assigned_at ASC;
