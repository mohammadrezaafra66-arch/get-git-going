DO $$
DECLARE
  v_has_pg_cron boolean;
BEGIN
  -- Try to enable pg_cron; ignore failure on environments where it is unavailable
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron extension not available, skipping schedule: %', SQLERRM;
  END;

  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO v_has_pg_cron;

  IF v_has_pg_cron THEN
    -- Unschedule prior job with the same name (if any), then schedule fresh
    BEGIN
      PERFORM cron.unschedule('daily-birthday-notifications');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'daily-birthday-notifications',
      '0 6 * * *',
      $cron$ SELECT public.generate_birthday_notifications(); $cron$
    );
  END IF;
END
$$;