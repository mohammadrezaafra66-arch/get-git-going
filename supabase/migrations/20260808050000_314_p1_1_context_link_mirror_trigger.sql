SET client_encoding='UTF8';

-- ---------------------------------------------------------------------------
-- UNIFY P1.1 — a person_context_links row of kind customer/supplier always has
-- a mirror row behind it.
--
-- Why this exists
--   `person_create_inline` already creates the suppliers/customers mirror and
--   then writes the context link with ref_table/ref_id filled in. But a link
--   inserted any other way — a direct PostgREST POST, an import, a migration —
--   produced a link pointing at nothing. The live database had exactly one such
--   row on 2026-08-08 (person 14bb7791 «روشناس», supplier link, no suppliers
--   row), which is the drift this trigger closes.
--
-- BEFORE INSERT, not AFTER INSERT
--   The mission text says AFTER. BEFORE is used instead because the trigger has
--   to write ref_table/ref_id back onto the row it is mirroring. From an AFTER
--   trigger that costs a second UPDATE, which fires trg_pcl_audit_update and
--   writes a spurious audit row for a change nobody made. From BEFORE the
--   assignment is part of the same insert, and the ref-pair CHECK constraint
--   still sees a consistent row. Same outcome, one statement, no phantom audit.
--
-- SECURITY INVOKER (i.e. no SECURITY DEFINER), deliberately
--   Creating a supplier is a privileged action: suppliers RLS allows INSERT to
--   admin/manager/accountant, while person_context_links allows INSERT to
--   admin/manager/sales/accountant. A SECURITY DEFINER trigger would hand
--   `sales` a side door to create supplier rows it cannot create directly —
--   principle 6/7 says no. As an invoker trigger the mirror is created only if
--   the caller could have created it by hand, and otherwise the insert is
--   rejected with the ordinary RLS error.
--
-- Idempotent
--   A link that already carries a ref_id is left alone, and a person who
--   already has a mirror gets attached to it rather than a second one.
--
--   Re-stating an already-true fact is a no-op, not an error. Filling in the
--   ref makes a repeated bare link collide with the existing unique index
--   uq_pcl_active_ref (person_id, context_kind, ref_table, ref_id WHERE
--   ended_at IS NULL) — a hard 23505 where before the insert quietly succeeded
--   and produced a second dangling row. The dry-run hit exactly that. So the
--   trigger returns NULL and skips the insert instead, which is the same choice
--   person_create_inline already made with ON CONFLICT DO NOTHING. This applies
--   only to the bare-ref path; a caller that supplies ref_id itself still meets
--   the unique index exactly as it does today.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.person_context_link_ensure_mirror()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _mirror_id uuid;
  _name      text;
  _phone     text;
BEGIN
  -- Only the two context kinds that own a legacy mirror table.
  IF NEW.context_kind NOT IN ('customer', 'supplier') THEN
    RETURN NEW;
  END IF;

  -- The caller already chose a mirror (person_create_inline, customer_set_person,
  -- the import paths). Never second-guess an explicit ref.
  IF NEW.ref_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.display_name INTO _name
  FROM public.persons p
  WHERE p.id = NEW.person_id;

  -- Person not visible or not there: leave the row alone and let the
  -- person_context_links_person_id_fkey / RLS reject it on its own terms,
  -- rather than raising a second, more confusing error from in here.
  IF _name IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pi.value_raw INTO _phone
  FROM public.person_identifiers pi
  WHERE pi.person_id = NEW.person_id
    AND pi.kind      = 'mobile_e164'
    AND pi.status   <> 'revoked'
  ORDER BY pi.is_primary DESC, pi.created_at ASC
  LIMIT 1;

  IF NEW.context_kind = 'supplier' THEN
    SELECT s.id INTO _mirror_id
    FROM public.suppliers s
    WHERE s.person_id = NEW.person_id
    LIMIT 1;

    IF _mirror_id IS NULL THEN
      -- status/trust_level match what person_create_inline writes, so the two
      -- creation paths cannot drift apart.
      INSERT INTO public.suppliers (name, phone, person_id, created_by, trust_level, status)
      VALUES (btrim(_name), _phone, NEW.person_id, auth.uid(), 'medium', 'pending')
      RETURNING id INTO _mirror_id;
    END IF;

    NEW.ref_table := 'suppliers';
    NEW.ref_id    := _mirror_id;

    IF EXISTS (
      SELECT 1 FROM public.person_context_links l
      WHERE l.person_id    = NEW.person_id
        AND l.context_kind = 'supplier'
        AND l.ref_table    = 'suppliers'
        AND l.ref_id       = _mirror_id
        AND l.ended_at IS NULL
    ) THEN
      RETURN NULL;  -- already a supplier; nothing to state twice
    END IF;

  ELSE
    SELECT c.id INTO _mirror_id
    FROM public.customers c
    WHERE c.person_id = NEW.person_id
    LIMIT 1;

    IF _mirror_id IS NULL THEN
      INSERT INTO public.customers (name, phone, person_id)
      VALUES (btrim(_name), _phone, NEW.person_id)
      RETURNING id INTO _mirror_id;
    END IF;

    NEW.ref_table := 'customers';
    NEW.ref_id    := _mirror_id;

    IF EXISTS (
      SELECT 1 FROM public.person_context_links l
      WHERE l.person_id    = NEW.person_id
        AND l.context_kind = 'customer'
        AND l.ref_table    = 'customers'
        AND l.ref_id       = _mirror_id
        AND l.ended_at IS NULL
    ) THEN
      RETURN NULL;  -- already a customer; nothing to state twice
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.person_context_link_ensure_mirror() IS
  'UNIFY P1.1 (migration 314): guarantees every customer/supplier person_context_links row has a mirror row. SECURITY INVOKER on purpose — the mirror is only created if the caller could create it directly.';

DROP TRIGGER IF EXISTS trg_pcl_ensure_mirror ON public.person_context_links;

CREATE TRIGGER trg_pcl_ensure_mirror
  BEFORE INSERT ON public.person_context_links
  FOR EACH ROW
  WHEN (NEW.context_kind IN ('customer', 'supplier'))
  EXECUTE FUNCTION public.person_context_link_ensure_mirror();

-- ---------------------------------------------------------------------------
-- Backfill: existing links with no mirror behind them.
--
-- Runs as the migration role, so RLS does not apply here — that is intended for
-- a one-time repair of rows that predate the trigger. Only INSERTs, never a
-- delete: a link whose ref is already set is untouched.
-- ---------------------------------------------------------------------------

DO $backfill$
DECLARE
  _l          record;
  _mirror_id  uuid;
  _phone      text;
  _made_sup   int := 0;
  _made_cust  int := 0;
  _relinked   int := 0;
BEGIN
  FOR _l IN
    SELECT l.id, l.person_id, l.context_kind, p.display_name
    FROM public.person_context_links l
    JOIN public.persons p ON p.id = l.person_id
    WHERE l.context_kind IN ('customer', 'supplier')
      AND l.ref_id IS NULL
    ORDER BY l.created_at
  LOOP
    SELECT pi.value_raw INTO _phone
    FROM public.person_identifiers pi
    WHERE pi.person_id = _l.person_id
      AND pi.kind      = 'mobile_e164'
      AND pi.status   <> 'revoked'
    ORDER BY pi.is_primary DESC, pi.created_at ASC
    LIMIT 1;

    IF _l.context_kind = 'supplier' THEN
      SELECT s.id INTO _mirror_id
      FROM public.suppliers s WHERE s.person_id = _l.person_id LIMIT 1;

      IF _mirror_id IS NULL THEN
        INSERT INTO public.suppliers (name, phone, person_id, trust_level, status)
        VALUES (btrim(_l.display_name), _phone, _l.person_id, 'medium', 'pending')
        RETURNING id INTO _mirror_id;
        _made_sup := _made_sup + 1;
      END IF;

      UPDATE public.person_context_links
         SET ref_table = 'suppliers', ref_id = _mirror_id
       WHERE id = _l.id;

    ELSE
      SELECT c.id INTO _mirror_id
      FROM public.customers c WHERE c.person_id = _l.person_id LIMIT 1;

      IF _mirror_id IS NULL THEN
        INSERT INTO public.customers (name, phone, person_id)
        VALUES (btrim(_l.display_name), _phone, _l.person_id)
        RETURNING id INTO _mirror_id;
        _made_cust := _made_cust + 1;
      END IF;

      UPDATE public.person_context_links
         SET ref_table = 'customers', ref_id = _mirror_id
       WHERE id = _l.id;
    END IF;

    _relinked := _relinked + 1;
    _mirror_id := NULL;
    _phone := NULL;
  END LOOP;

  RAISE NOTICE 'P1.1 backfill: % link(s) repaired, % supplier row(s) created, % customer row(s) created',
    _relinked, _made_sup, _made_cust;
END;
$backfill$;

-- Post-condition: no customer/supplier link may be left without a mirror.
DO $assert$
DECLARE
  _left int;
BEGIN
  SELECT count(*) INTO _left
  FROM public.person_context_links
  WHERE context_kind IN ('customer', 'supplier')
    AND ref_id IS NULL;

  IF _left <> 0 THEN
    RAISE EXCEPTION 'P1.1 backfill incomplete: % link(s) still have no mirror', _left;
  END IF;
END;
$assert$;
