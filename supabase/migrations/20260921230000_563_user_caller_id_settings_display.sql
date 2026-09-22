SET client_encoding='UTF8';

-- ============================================================================
-- 563 - user_caller_id_settings: display_seconds + only_my_* filters (B3)
-- ============================================================================
-- Extends table from 558 (20260919180000_558_user_caller_id_settings.sql).
-- Does NOT recreate the table; preserves enabled / show_* columns.
--
-- Rollback: docs/missions/salesdesk-9-fixes/revert/563_user_caller_id_settings_display.sql
-- ============================================================================

SET lock_timeout = '60s';

ALTER TABLE public.user_caller_id_settings
  ADD COLUMN IF NOT EXISTS display_seconds integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS only_my_extension boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS only_my_customers boolean NOT NULL DEFAULT false;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_caller_id_settings_display_seconds_check'
      AND conrelid = 'public.user_caller_id_settings'::regclass
  ) THEN
    ALTER TABLE public.user_caller_id_settings
      ADD CONSTRAINT user_caller_id_settings_display_seconds_check
      CHECK (display_seconds BETWEEN 5 AND 120);
  END IF;
END
$do$;

COMMENT ON COLUMN public.user_caller_id_settings.display_seconds IS
  'Caller ID card TTL in seconds (5–120). Default 15.';
COMMENT ON COLUMN public.user_caller_id_settings.only_my_extension IS
  'When true, show only rings for the user''s own extension.';
COMMENT ON COLUMN public.user_caller_id_settings.only_my_customers IS
  'When true, show only rings matched to the user''s own customers.';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_caller_id_settings'
      AND column_name = 'display_seconds'
  ) THEN
    RAISE EXCEPTION '563: display_seconds missing after ALTER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_caller_id_settings'
      AND column_name = 'only_my_extension'
  ) THEN
    RAISE EXCEPTION '563: only_my_extension missing after ALTER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_caller_id_settings'
      AND column_name = 'only_my_customers'
  ) THEN
    RAISE EXCEPTION '563: only_my_customers missing after ALTER';
  END IF;
END
$do$;
