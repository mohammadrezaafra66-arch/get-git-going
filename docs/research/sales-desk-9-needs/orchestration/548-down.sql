SET client_encoding='UTF8';

-- Reverse of 548: drop author_id lock trigger/fn; restore DELETE grant from 545.

DROP TRIGGER IF EXISTS trg_sales_interactions_lock_author_id ON public.sales_interactions;
DROP FUNCTION IF EXISTS public.tg_sales_interactions_lock_author_id();

GRANT DELETE ON TABLE public.sales_interactions TO authenticated;

DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.sales_interactions'::regclass
       AND tgname = 'trg_sales_interactions_lock_author_id'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '548-down: lock_author_id trigger still present';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.sales_interactions', 'DELETE') THEN
    RAISE EXCEPTION '548-down: authenticated DELETE grant not restored';
  END IF;

  RAISE NOTICE '548-down OK';
END
$assert$;
