SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='sales_interactions'
  AND column_name IN ('activity_type_id','due_at','due_has_time','original_due_at','done_at','result_note','deal_id','salesperson_id')
ORDER BY 1;
SELECT count(*) AS activity_types FROM public.sales_activity_types;
SELECT public.tehran_today() AS tehran_today;
