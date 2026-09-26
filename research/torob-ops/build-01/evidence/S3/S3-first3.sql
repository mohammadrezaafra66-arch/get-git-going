SET client_encoding TO 'UTF8';
-- first 3 assignments + current product url
SELECT a.assigned_at, p.id, p.name, p.torob_url AS product_torob_url_now,
       a.url AS assignment_url, a.score, a.assigned, a.reasons
  FROM public.torob_link_assignments a
  JOIN public.products p ON p.id = a.product_id
 ORDER BY a.assigned_at ASC
 LIMIT 3;

-- original URL product: no assignment row
SELECT count(*) AS assignments_for_original
  FROM public.torob_link_assignments
 WHERE product_id = '41464c40-1bf7-4909-bc2e-4eeadaf02613';

SELECT count(*) AS active_with_url
  FROM public.products
 WHERE is_active AND torob_url IS NOT NULL AND btrim(torob_url) <> '';

SELECT count(*) AS assigned_true FROM public.torob_link_assignments WHERE assigned;
