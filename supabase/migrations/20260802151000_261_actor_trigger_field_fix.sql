SET client_encoding='UTF8';

-- =============================================================================
-- Issue 219 / C5.2 — fixing the actor trigger from migration 260
-- =============================================================================
-- 260 picked the actor column with a CASE *expression*:
--
--     _actor := CASE TG_TABLE_NAME
--                 WHEN 'purchases'         THEN NEW.created_by
--                 WHEN 'purchase_requests' THEN NEW.requested_by
--               END;
--
-- plpgsql compiles that as one SQL expression, so every field reference in it
-- has to resolve against the actual row type — including the branch that will
-- not be taken. Firing on `purchases`, where NEW has no `requested_by`, it
-- failed with:
--
--     record "new" has no field "requested_by"
--
-- which broke purchase creation outright. Caught immediately by the C5 suite,
-- but 260 is applied, so it is corrected here rather than edited in place.
--
-- The fix is IF / ELSIF statements: each branch is compiled and executed on its
-- own, so only the field that exists on this table is ever touched.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tg_purchase_actor_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _actor uuid;
BEGIN
  IF TG_TABLE_NAME = 'purchases' THEN
    _actor := NEW.created_by;
  ELSIF TG_TABLE_NAME = 'purchase_requests' THEN
    _actor := NEW.requested_by;
  ELSE
    RETURN NEW;
  END IF;

  -- A NULL actor is left to the column's own NOT NULL constraint to complain
  -- about; this trigger only judges accounts that exist.
  IF _actor IS NOT NULL AND NOT public.is_active_actor(_actor) THEN
    RAISE EXCEPTION 'حساب کاربری شما فعال نیست.'
      USING ERRCODE = '42501', HINT = 'ACTOR_INACTIVE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_purchase_actor_active() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.tg_purchase_actor_active() IS
  'Issue 219 C5: refuses a purchase or purchase request whose actor is a '
  'deactivated or rejected account, whichever path the insert arrives by.';
