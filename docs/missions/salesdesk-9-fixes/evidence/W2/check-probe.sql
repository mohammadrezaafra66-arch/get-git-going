-- CHECK violation probe (rolled back) + FK presence already verified
BEGIN;
DO $do$
BEGIN
  BEGIN
    INSERT INTO public.user_caller_id_settings (user_id, display_seconds)
    VALUES ('00000000-0000-0000-0000-000000000001', 4);
    RAISE EXCEPTION 'CHECK should have rejected display_seconds=4';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'CHECK_OK rejected display_seconds=4';
  END;

  BEGIN
    INSERT INTO public.user_caller_id_settings (user_id, display_seconds)
    VALUES ('00000000-0000-0000-0000-000000000001', 121);
    RAISE EXCEPTION 'CHECK should have rejected display_seconds=121';
  EXCEPTION
    WHEN check_violation THEN
      RAISE NOTICE 'CHECK_OK rejected display_seconds=121';
  END;
END
$do$;
ROLLBACK;
