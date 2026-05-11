-- PRICE-RT.3: Add product_computed_prices to supabase_realtime publication
-- so the UI can react to worker-driven price updates in near real time.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'product_computed_prices'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.product_computed_prices';
  END IF;
END $$;

-- Ensure full row payload on UPDATE for downstream filtering on the client.
ALTER TABLE public.product_computed_prices REPLICA IDENTITY FULL;
