SET client_encoding='UTF8';

-- 437 - attach public.tg_purchase_actor_active() to the two tables it was
-- written for.
--
-- The function has existed and been correct for some time, but it was attached
-- to NO trigger:
--
--   SELECT c.relname, t.tgname FROM pg_trigger t
--     JOIN pg_class c ON c.oid = t.tgrelid
--     JOIN pg_proc  p ON p.oid = t.tgfoid
--    WHERE p.proname = 'tg_purchase_actor_active';
--   -> (0 rows)                                        measured 2026-09-05
--
-- So the guard it implements - a deactivated account may not create purchase
-- records - was not enforced anywhere. The function itself is not modified by
-- this migration; only the two triggers are added.
--
-- The function branches on TG_TABLE_NAME and reads:
--     purchases          -> NEW.created_by
--     purchase_requests  -> NEW.requested_by
-- and raises SQLSTATE 42501 (HINT 'ACTOR_INACTIVE') when
-- public.is_active_actor(actor) is false. A NULL actor is deliberately left to
-- the column's own NOT NULL constraint.
--
-- BEFORE INSERT only, deliberately. The function judges the row's *author*
-- (created_by / requested_by), not the session performing the statement, so
-- firing it on UPDATE would permanently freeze every row whose original author
-- was later deactivated - including updates made by active administrators.
-- Creation is also exactly the operation the guard was written to refuse.
--
-- No table is dropped, no data is written, no function signature changes.
-- The DROP TRIGGER IF EXISTS lines make this migration re-runnable; both are
-- no-ops today (0 rows above).

DROP TRIGGER IF EXISTS trg_purchases_actor_active ON public.purchases;
CREATE TRIGGER trg_purchases_actor_active
  BEFORE INSERT ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_purchase_actor_active();

DROP TRIGGER IF EXISTS trg_purchase_requests_actor_active ON public.purchase_requests;
CREATE TRIGGER trg_purchase_requests_actor_active
  BEFORE INSERT ON public.purchase_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_purchase_actor_active();

-- Fail loudly if either trigger did not land.
DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE p.proname = 'tg_purchase_actor_active'
     AND NOT t.tgisinternal;
  IF n <> 2 THEN
    RAISE EXCEPTION 'migration 437: expected 2 triggers on tg_purchase_actor_active, found %', n;
  END IF;
END
$$;
