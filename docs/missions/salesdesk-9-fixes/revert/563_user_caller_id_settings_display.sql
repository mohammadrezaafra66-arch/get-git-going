SET client_encoding='UTF8';

-- 563-down: reverse user_caller_id_settings display/filter columns
-- (copy/staging only — never production).

ALTER TABLE public.user_caller_id_settings
  DROP CONSTRAINT IF EXISTS user_caller_id_settings_display_seconds_check;

ALTER TABLE public.user_caller_id_settings
  DROP COLUMN IF EXISTS display_seconds,
  DROP COLUMN IF EXISTS only_my_extension,
  DROP COLUMN IF EXISTS only_my_customers;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260921230000';
