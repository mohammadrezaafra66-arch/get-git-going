-- FX.2B: Audit Navasan mappings — disable ambiguous symbols (no guessing for financial rates)
-- USD Tehran: نوسان نمادهای usd / usd_sell / usd_buy / harat_naghdi_sell / dolar_soleimanie_sell دارد.
--   نماد دقیق برای «دلار تهران آزاد» در مستندات فعلی مبهم است → disabled تا تأیید ادمین.
-- AED: نوسان aed و dirham_dubai دارد؛ مرجع دقیق «درهم تهران» مبهم است → disabled.
DO $$
DECLARE v_nav uuid;
BEGIN
  SELECT id INTO v_nav FROM public.market_rate_sources WHERE code='NAVASAN_API';
  IF v_nav IS NULL THEN RETURN; END IF;

  UPDATE public.market_rate_source_mappings m
  SET is_enabled = false,
      note = 'FX.2B: نماد دقیق نوسان برای دلار تهران مبهم است (usd / usd_sell / usd_buy)؛ تا تأیید ادمین disabled.'
  FROM public.market_indicators i
  WHERE m.indicator_id = i.id AND m.source_id = v_nav AND i.code = 'USD_TEHRAN_FREE';

  UPDATE public.market_rate_source_mappings m
  SET is_enabled = false,
      note = 'FX.2B: نماد دقیق نوسان برای درهم مبهم است (aed / dirham_dubai)؛ تا تأیید ادمین disabled.'
  FROM public.market_indicators i
  WHERE m.indicator_id = i.id AND m.source_id = v_nav AND i.code = 'AED_TEHRAN';
END $$;