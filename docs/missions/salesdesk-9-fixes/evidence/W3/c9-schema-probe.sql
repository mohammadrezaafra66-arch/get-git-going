SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'sales_quotes'
  AND column_name = 'interaction_id';

SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'sales_quotes_interaction_id_idx';

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.sales_quotes'::regclass
  AND conname LIKE '%interaction_id%';
