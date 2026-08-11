-- 284: canonical phone storage, enforced by trigger, with a collision review queue.
--
-- Canonical form for a MOBILE is 09XXXXXXXXX: leading zero, Latin digits, no separators,
-- 11 characters. Landlines keep their area code and are only stripped of separators and
-- folded to Latin digits -- the mobile pattern is deliberately NOT forced onto them.
--
-- IMPORTANT distinction, from research R2.3: person_identifiers.value_normalized for
-- kind='mobile_e164' stores +989XXXXXXXXX and that is CORRECT and unchanged here. The kind is
-- literally named mobile_e164 and the identity model depends on that contract. The 09… rule
-- applies to the plain phone columns on business tables, which have no such contract.
--
-- Research measured every populated phone in this database as already canonical, so the
-- backfill below is expected to change 0 rows. It still runs: "already correct" is a fact
-- about today's data, not a property of the schema, and the trigger is what makes it a
-- property.
--
-- Rollback: docs/verification/284-down.sql
SET client_encoding='UTF8';

-- ---------------------------------------------------------------- helper ----
-- Reuses normalize_identifier() rather than reimplementing the parsing (rule 14). Non-strict
-- so an unparseable value returns NULL instead of raising: a phone column is not the place to
-- abort a sales quote or a payment receipt. Unparseable values are left exactly as typed.
CREATE OR REPLACE FUNCTION public.normalize_phone_local(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
DECLARE
  _e164 text;
  _land text;
BEGIN
  IF _raw IS NULL OR btrim(_raw) = '' THEN
    RETURN _raw;
  END IF;

  -- mobile first: '+989123456789' -> '09123456789'
  _e164 := public.normalize_identifier('mobile_e164', _raw, false);
  IF _e164 IS NOT NULL THEN
    RETURN '0' || substr(_e164, 4);
  END IF;

  -- then landline: keeps the area code, digits only
  _land := public.normalize_identifier('landline', _raw, false);
  IF _land IS NOT NULL THEN
    RETURN _land;
  END IF;

  -- neither shape: leave the value untouched rather than lose what the user typed
  RETURN _raw;
END;
$fn$;

COMMENT ON FUNCTION public.normalize_phone_local(text) IS
  'Canonical local phone form: 09XXXXXXXXX for mobiles, digits-with-area-code for landlines. '
  'Returns the input unchanged when it is neither, so a write is never rejected on a phone.';

-- --------------------------------------------------------------- trigger ----
-- One function for every table. Column names arrive via TG_ARGV, so adding a table later is a
-- CREATE TRIGGER and nothing else.
CREATE OR REPLACE FUNCTION public.tg_normalize_phone_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  _rec  jsonb;
  _col  text;
  _val  text;
  _norm text;
BEGIN
  _rec := to_jsonb(NEW);
  FOREACH _col IN ARRAY TG_ARGV LOOP
    _val := _rec ->> _col;
    IF _val IS NOT NULL AND btrim(_val) <> '' THEN
      _norm := public.normalize_phone_local(_val);
      IF _norm IS DISTINCT FROM _val THEN
        _rec := jsonb_set(_rec, ARRAY[_col], to_jsonb(_norm));
      END IF;
    END IF;
  END LOOP;
  NEW := jsonb_populate_record(NEW, _rec);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_normalize_phone ON public.customers;
CREATE TRIGGER trg_normalize_phone BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phone_columns('phone');

DROP TRIGGER IF EXISTS trg_normalize_phone ON public.suppliers;
CREATE TRIGGER trg_normalize_phone BEFORE INSERT OR UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phone_columns('phone');

DROP TRIGGER IF EXISTS trg_normalize_phone ON public.external_parties;
CREATE TRIGGER trg_normalize_phone BEFORE INSERT OR UPDATE ON public.external_parties
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phone_columns('phone');

DROP TRIGGER IF EXISTS trg_normalize_phone ON public.profiles;
CREATE TRIGGER trg_normalize_phone BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phone_columns('phone');

DROP TRIGGER IF EXISTS trg_normalize_phone ON public.visitors;
CREATE TRIGGER trg_normalize_phone BEFORE INSERT OR UPDATE ON public.visitors
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phone_columns('phone');

DROP TRIGGER IF EXISTS trg_normalize_phone ON public.sales_quotes;
CREATE TRIGGER trg_normalize_phone BEFORE INSERT OR UPDATE ON public.sales_quotes
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phone_columns('customer_phone');

DROP TRIGGER IF EXISTS trg_normalize_phone ON public.payment_receipts;
CREATE TRIGGER trg_normalize_phone BEFORE INSERT OR UPDATE ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phone_columns('payer_phone', 'receiver_phone');

DROP TRIGGER IF EXISTS trg_normalize_phone ON public.waybills;
CREATE TRIGGER trg_normalize_phone BEFORE INSERT OR UPDATE ON public.waybills
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phone_columns('sender_phone', 'receiver_phone');

DROP TRIGGER IF EXISTS trg_normalize_phone ON public.stock_alert_requests;
CREATE TRIGGER trg_normalize_phone BEFORE INSERT OR UPDATE ON public.stock_alert_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_phone_columns('customer_phone');

-- ------------------------------------------------------ collision queue ----
CREATE TABLE IF NOT EXISTS public.phone_collisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_phone  text NOT NULL,
  entity_refs       jsonb NOT NULL,
  detected_at       timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'pending',
  -- auth.users, qualified explicitly. Existing FKs in this schema say plain `users(id)` only
  -- because the session that created them had `auth` on the search_path; there is no
  -- public.users.
  resolved_by       uuid REFERENCES auth.users(id),
  resolved_at       timestamptz,
  resolution_note   text,
  CONSTRAINT phone_collisions_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'resolved'::text, 'ignored'::text])),
  CONSTRAINT phone_collisions_refs_is_array
    CHECK (jsonb_typeof(entity_refs) = 'array')
);

COMMENT ON TABLE public.phone_collisions IS
  'Two different records normalising to one phone number. Detection only -- this table never '
  'merges anything and never picks a winner. /persons/merge remains the only merge path.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_phone_collisions_pending
  ON public.phone_collisions (normalized_phone)
  WHERE status = 'pending';

ALTER TABLE public.phone_collisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS phone_collisions_read ON public.phone_collisions;
CREATE POLICY phone_collisions_read ON public.phone_collisions FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager','accountant']::text[]));

DROP POLICY IF EXISTS phone_collisions_write ON public.phone_collisions;
CREATE POLICY phone_collisions_write ON public.phone_collisions FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

-- viewer-only accounts must not see it either (migration 281's pattern)
DROP POLICY IF EXISTS viewer_restricted ON public.phone_collisions;
CREATE POLICY viewer_restricted ON public.phone_collisions AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_viewer_only(auth.uid()))
  WITH CHECK (NOT public.is_viewer_only(auth.uid()));

-- ------------------------------------------------------------ detection ----
CREATE OR REPLACE FUNCTION public.detect_phone_collisions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _inserted integer := 0;
BEGIN
  WITH all_phones AS (
    SELECT 'customers'  AS tbl, c.id::text AS ref, c.name        AS label,
           public.normalize_phone_local(c.phone) AS ph
      FROM public.customers c WHERE coalesce(btrim(c.phone), '') <> ''
    UNION ALL
    SELECT 'suppliers', s.id::text, s.name, public.normalize_phone_local(s.phone)
      FROM public.suppliers s WHERE coalesce(btrim(s.phone), '') <> ''
    UNION ALL
    SELECT 'external_parties', e.id::text, e.full_name, public.normalize_phone_local(e.phone)
      FROM public.external_parties e WHERE coalesce(btrim(e.phone), '') <> ''
    UNION ALL
    SELECT 'profiles', p.id::text, p.full_name, public.normalize_phone_local(p.phone)
      FROM public.profiles p WHERE coalesce(btrim(p.phone), '') <> ''
    UNION ALL
    SELECT 'visitors', v.id::text, v.full_name, public.normalize_phone_local(v.phone)
      FROM public.visitors v WHERE coalesce(btrim(v.phone), '') <> ''
  ),
  grouped AS (
    SELECT ph,
           jsonb_agg(jsonb_build_object('table', tbl, 'id', ref, 'label', label)
                     ORDER BY tbl, ref) AS refs,
           count(*) AS n
      FROM all_phones
     WHERE ph ~ '^09[0-9]{9}$'
     GROUP BY ph
    HAVING count(*) > 1
  )
  INSERT INTO public.phone_collisions (normalized_phone, entity_refs)
  SELECT g.ph, g.refs
    FROM grouped g
   WHERE NOT EXISTS (
     SELECT 1 FROM public.phone_collisions pc
      WHERE pc.normalized_phone = g.ph AND pc.status = 'pending');

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  RETURN _inserted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.detect_phone_collisions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detect_phone_collisions() TO authenticated, service_role;

-- ------------------------------------------------------------- backfill ----
-- Order matters and is the whole point: DETECT first, then normalise only what cannot
-- collide. A migration that rewrites phones and then discovers a unique violation halfway
-- through is exactly the bad day the brief warns about.
SELECT public.detect_phone_collisions();

UPDATE public.customers        SET phone = public.normalize_phone_local(phone)
 WHERE coalesce(btrim(phone),'') <> '' AND phone IS DISTINCT FROM public.normalize_phone_local(phone);
UPDATE public.suppliers        SET phone = public.normalize_phone_local(phone)
 WHERE coalesce(btrim(phone),'') <> '' AND phone IS DISTINCT FROM public.normalize_phone_local(phone);
UPDATE public.external_parties SET phone = public.normalize_phone_local(phone)
 WHERE coalesce(btrim(phone),'') <> '' AND phone IS DISTINCT FROM public.normalize_phone_local(phone);
UPDATE public.profiles         SET phone = public.normalize_phone_local(phone)
 WHERE coalesce(btrim(phone),'') <> '' AND phone IS DISTINCT FROM public.normalize_phone_local(phone);
UPDATE public.visitors         SET phone = public.normalize_phone_local(phone)
 WHERE coalesce(btrim(phone),'') <> '' AND phone IS DISTINCT FROM public.normalize_phone_local(phone);
UPDATE public.sales_quotes     SET customer_phone = public.normalize_phone_local(customer_phone)
 WHERE coalesce(btrim(customer_phone),'') <> '' AND customer_phone IS DISTINCT FROM public.normalize_phone_local(customer_phone);
UPDATE public.payment_receipts SET payer_phone = public.normalize_phone_local(payer_phone)
 WHERE coalesce(btrim(payer_phone),'') <> '' AND payer_phone IS DISTINCT FROM public.normalize_phone_local(payer_phone);
UPDATE public.payment_receipts SET receiver_phone = public.normalize_phone_local(receiver_phone)
 WHERE coalesce(btrim(receiver_phone),'') <> '' AND receiver_phone IS DISTINCT FROM public.normalize_phone_local(receiver_phone);

DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT phone AS p FROM public.customers WHERE coalesce(btrim(phone),'') <> ''
    UNION ALL SELECT phone FROM public.suppliers WHERE coalesce(btrim(phone),'') <> ''
    UNION ALL SELECT phone FROM public.profiles WHERE coalesce(btrim(phone),'') <> ''
    UNION ALL SELECT phone FROM public.visitors WHERE coalesce(btrim(phone),'') <> ''
    UNION ALL SELECT customer_phone FROM public.sales_quotes WHERE coalesce(btrim(customer_phone),'') <> ''
  ) s WHERE p IS DISTINCT FROM public.normalize_phone_local(p);
  IF n <> 0 THEN RAISE EXCEPTION '% phone values are still not canonical', n; END IF;

  SELECT count(*) INTO n FROM pg_trigger
   WHERE NOT tgisinternal AND tgname = 'trg_normalize_phone';
  IF n <> 9 THEN RAISE EXCEPTION 'expected 9 phone-normalising triggers, found %', n; END IF;
END
$chk$;
