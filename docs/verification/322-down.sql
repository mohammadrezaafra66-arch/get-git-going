SET client_encoding='UTF8';

-- Down script for migration 322 (UNIFY P1.5).
--
-- Restores the pre-322 state exactly:
--   * customer_set_person goes back to the snapshot in
--     docs/verification/pre-322/customer_set_person.sql (no person_id audit row)
--   * customer_clear_person is recreated as it was — including the NOT NULL
--     contradiction that made it unusable, because that IS the previous state
--   * the two dynamic supplier write policies are dropped
--
-- Note: restoring customer_clear_person restores a function that raises 23502
-- on every real call. That is deliberate — a down script returns the schema to
-- where it was, it does not improve on it. The UI caller is removed in the same
-- commit as 322, so restoring this alone leaves it unreferenced.

DROP POLICY IF EXISTS suppliers_insert_dynamic ON public.suppliers;
DROP POLICY IF EXISTS suppliers_update_dynamic ON public.suppliers;

CREATE OR REPLACE FUNCTION public.customer_clear_person(p_customer_id uuid, p_note text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_person_id uuid;
  v_updated       int;
  v_closed        int;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'شناسه مشتری الزامی است' USING ERRCODE = '22023';
  END IF;

  SELECT person_id INTO v_old_person_id
  FROM public.customers
  WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا دسترسی به آن ندارید' USING ERRCODE = 'P0002';
  END IF;

  IF v_old_person_id IS NULL THEN
    -- No-op; nothing to clear.
    RETURN false;
  END IF;

  -- Close active customer context link(s) for this customer.
  UPDATE public.person_context_links
     SET ended_at = now(),
         note     = COALESCE(p_note, note)
   WHERE context_kind = 'customer'
     AND ref_table    = 'customers'
     AND ref_id       = p_customer_id
     AND ended_at IS NULL;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  -- Clear the FK on customers.
  UPDATE public.customers
     SET person_id = NULL
   WHERE id = p_customer_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'دسترسی لازم برای ویرایش این مشتری را ندارید' USING ERRCODE = '42501';
  END IF;

  RETURN true;
END;
$function$;

-- customer_set_person: re-apply docs/verification/pre-322/customer_set_person.sql
-- verbatim to drop the person_id audit INSERT.
