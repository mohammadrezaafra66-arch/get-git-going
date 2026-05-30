-- Fix auth.users -> public.profiles profile creation trigger
-- Purpose:
-- After a new row is inserted into auth.users, run public.handle_new_auth_user()
-- so the matching public.profiles row is created.
--
-- Safety:
-- - Does not delete Docker volumes
-- - Does not restore database
-- - Does not touch existing users directly
-- - Backfill is intentionally NOT included here

begin;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

commit;
