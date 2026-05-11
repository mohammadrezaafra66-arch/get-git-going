ALTER TABLE public.product_sale_price_history REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'product_sale_price_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_sale_price_history;
  END IF;
END $$;