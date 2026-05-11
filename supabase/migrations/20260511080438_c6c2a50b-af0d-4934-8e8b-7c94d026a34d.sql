-- Add no-key public sources (idempotent)
INSERT INTO public.market_rate_sources (code, title_fa, source_type, base_url, is_enabled, confidence_weight, requires_api_key)
VALUES
  ('BRSAPI_PUBLIC', 'BrsApi رایگان', 'api', 'https://brsapi.ir', false, 0.75, false),
  ('TGJU_PUBLIC',   'TGJU عمومی',    'api', 'https://www.tgju.org', false, 0.70, false)
ON CONFLICT (code) DO NOTHING;

-- Enable realtime for market_rate_ticks (idempotent guard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'market_rate_ticks'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.market_rate_ticks';
  END IF;
END $$;

-- Ensure REPLICA IDENTITY FULL for proper realtime payloads
ALTER TABLE public.market_rate_ticks REPLICA IDENTITY FULL;