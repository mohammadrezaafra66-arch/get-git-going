-- IDs that 565 will backfill (kind=request AND salesperson_id IS NULL)
SELECT id::text
FROM public.sales_interactions
WHERE salesperson_id IS NULL AND kind = 'request'
ORDER BY id;
