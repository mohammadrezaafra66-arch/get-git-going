DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT count(*) INTO dup_count FROM (
    SELECT lower(btrim(name)) AS norm
    FROM public.marketing_channels
    GROUP BY 1
    HAVING count(*) > 1
  ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'MKT-2.3.a: duplicate marketing_channels.name detected (normalized lower(btrim(name))). Resolve duplicates manually before applying this migration.';
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS marketing_channels_name_norm_uq
  ON public.marketing_channels (lower(btrim(name)));