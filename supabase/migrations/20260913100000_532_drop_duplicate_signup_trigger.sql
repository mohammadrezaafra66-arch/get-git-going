SET client_encoding='UTF8';

-- 532 — signup writes exactly one audit_logs row instead of two.
--
-- WHAT WAS WRONG. `auth.users` carries TWO triggers, both AFTER INSERT, both bound to
-- the SAME function body `handle_new_auth_user()`:
--
--   on_auth_user_created            (created early in the project)
--   on_auth_user_created_afrakala   (a later, redundant duplicate — migration
--                                    20260610070014_5fb492d4-...)
--
-- CORRECTED FROM THE ORIGINAL BRIEF. The function is `handle_new_auth_user`, not
-- `handle_new_user` — no function by that name exists in this catalogue (see 448's
-- note on the unrelated, never-attached `handle_new_user`). And the defect is not
-- production-specific: both `afrakala` (test) and `postgres` (production) carry the
-- same duplicate pair, both enabled, both bound to a byte-identical body.
--
-- WHY THIS DOUBLE-FIRES SAFELY MOST OF THE TIME. Inside `handle_new_auth_user()`:
--   * the `profiles` insert carries `ON CONFLICT (id) DO NOTHING`
--   * the `user_roles` insert carries `ON CONFLICT DO NOTHING`
--   * the `audit_logs` insert carries NO conflict protection
-- So each signup silently writes one profile row, correctly, and TWO
-- `user_registered` audit_logs rows — one per trigger firing on the same INSERT.
-- Measured on the restored snapshot: this pattern already exists (15 `user_registered`
-- rows across 13 distinct users; 2 users have 2 rows each) and is left as-is here —
-- deleting the pre-existing duplicate rows is a data decision, not a schema one, and is
-- explicitly out of scope for this migration.
--
-- `profiles.status = 'pending'` with no `user_roles` row for every signup after the
-- first is the INTENDED cold state and is not touched.
--
-- WHAT CHANGES. Drop the redundant trigger only. `on_auth_user_created` is kept
-- untouched, so `handle_new_auth_user()` still fires exactly once per signup.
-- `DROP TRIGGER IF EXISTS` makes this idempotent: safe to run again, and safe on a
-- database where the duplicate was already removed by hand.

DROP TRIGGER IF EXISTS on_auth_user_created_afrakala ON auth.users;
