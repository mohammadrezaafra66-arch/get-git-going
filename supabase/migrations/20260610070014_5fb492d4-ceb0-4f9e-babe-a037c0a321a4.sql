-- Attach trigger on auth.users -> public.handle_new_auth_user
-- Safe / idempotent. Does NOT touch other triggers on auth.users.
DROP TRIGGER IF EXISTS on_auth_user_created_afrakala ON auth.users;
CREATE TRIGGER on_auth_user_created_afrakala
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill missing profiles for users that exist in auth.users but not in public.profiles
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT u.id, u.email, u.raw_user_meta_data, u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  LOOP
    INSERT INTO public.profiles (id, full_name, phone, position, status, is_active, registered_at)
    VALUES (
      r.id,
      COALESCE(r.raw_user_meta_data->>'full_name', r.email),
      r.raw_user_meta_data->>'phone',
      r.raw_user_meta_data->>'position_proposed',
      'pending',
      true,
      COALESCE(r.created_at, now())
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
    VALUES (
      r.id,
      'user',
      r.id::text,
      'user_profile_backfilled',
      jsonb_build_object('email', r.email, 'reason', 'missing_profile_backfill')
    );
  END LOOP;
END $$;