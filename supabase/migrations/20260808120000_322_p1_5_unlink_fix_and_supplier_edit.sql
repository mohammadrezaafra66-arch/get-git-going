SET client_encoding='UTF8';

-- ---------------------------------------------------------------------------
-- UNIFY P1.5 — two fixes discovered while building dual role.
--
-- 5a. customer_clear_person could never succeed.
--     It does `UPDATE customers SET person_id = NULL`, but customers.person_id
--     is NOT NULL. Every real call raised 23502. The UI still offered the
--     button, so "قطع اتصال" was a guaranteed error.
--
--     Option (الف) of the mission is taken: the function is DROPped rather
--     than repaired. Unlinking is meaningless now that every customer must
--     have a person — there is no valid state to unlink into. A full grep found
--     exactly one caller chain (CustomerPersonLink -> unlinkCustomerFromPerson
--     -> this function) and it is removed in the same commit; nothing else in
--     the repository references it.
--
--     Option (ب) — "unlink only when a replacement is supplied" — needs no work
--     here: customer_set_person ALREADY performs an atomic replace. It closes
--     the active links, sets the new person_id and opens a fresh link, all in
--     one transaction. So the UI keeps a way to correct a mis-linked customer
--     without this function existing and without a signature change.
--
-- 5b. sales and purchase_specialist could not edit suppliers.
--     role_permissions has said for some time that both roles hold
--     can_create/can_update on `suppliers`, but the suppliers RLS policies name
--     admin/manager/accountant literally, so the database rejected them. The
--     owner has approved these two roles editing suppliers, so the guard is
--     opened at BOTH layers — opening only the UI would leave saves failing and
--     would violate principle 6.
--
--     The new policies read has_dynamic_permission(), i.e. role_permissions
--     becomes the source of truth. They are ADDED, not substituted: RLS
--     policies are OR'd, and the existing "manager admin write suppliers"
--     policy is left in place on purpose so managers do not silently lose
--     write access (role_permissions says manager is view-only, which
--     contradicts today's behaviour — resolving that is an RBAC decision for
--     the owner, not a side effect of this migration).
--
--     The RESTRICTIVE viewer_restricted policy still applies on top, so a
--     viewer-only account gains nothing from any of this.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5a — audit person_id changes from inside the link function.
--
-- Per the mission, the audit is added here rather than to audit_customer_change():
-- that trigger records name/phone/city/notes/is_active and never mentioned
-- person_id, so re-pointing a customer at a different identity left no trace of
-- WHICH identity it moved between.
--
-- Patched, not rewritten (rule 4): the live definition was read with
-- pg_get_functiondef and snapshotted to docs/verification/pre-322/. The only
-- change is the audit INSERT below; every existing branch, message and the
-- signature are byte-identical.
--
-- The function stays SECURITY INVOKER. audit_logs' INSERT policy is
-- `with_check (uid() = actor_id)`, and actor_id is auth.uid() here, so the
-- write is permitted without granting the function any extra power.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.customer_set_person(p_customer_id uuid, p_person_id uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_person_id uuid;
  v_existing_link uuid;
  v_new_link      uuid;
  v_updated       int;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'شناسه مشتری الزامی است' USING ERRCODE = '22023';
  END IF;
  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'شناسه شخص الزامی است' USING ERRCODE = '22023';
  END IF;

  -- Visibility check via persons RLS (SELECT). Invisible/missing → safe message.
  PERFORM 1 FROM public.persons WHERE id = p_person_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'شخص مرتبط یافت نشد یا دسترسی به آن ندارید' USING ERRCODE = 'P0002';
  END IF;

  -- Read current person_id via customers RLS. Missing/invisible → safe message.
  SELECT person_id INTO v_old_person_id
  FROM public.customers
  WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'مشتری یافت نشد یا دسترسی به آن ندارید' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent path: same person already linked and an active context link exists.
  IF v_old_person_id IS NOT NULL AND v_old_person_id = p_person_id THEN
    SELECT id INTO v_existing_link
    FROM public.person_context_links
    WHERE person_id    = p_person_id
      AND context_kind = 'customer'
      AND ref_table    = 'customers'
      AND ref_id       = p_customer_id
      AND ended_at IS NULL
    LIMIT 1;

    IF v_existing_link IS NOT NULL THEN
      IF p_note IS NOT NULL THEN
        UPDATE public.person_context_links
           SET note = p_note
         WHERE id = v_existing_link;
      END IF;
      RETURN v_existing_link;
    END IF;
    -- No active link though person_id matches — fall through to create one.
  END IF;

  -- Close active link(s) for this customer regardless of which person they point to,
  -- so the (customer ↔ active person) invariant is maintained.
  UPDATE public.person_context_links
     SET ended_at = now()
   WHERE context_kind = 'customer'
     AND ref_table    = 'customers'
     AND ref_id       = p_customer_id
     AND ended_at IS NULL;

  -- Update customers.person_id (RLS enforced here).
  UPDATE public.customers
     SET person_id = p_person_id
   WHERE id = p_customer_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'دسترسی لازم برای ویرایش این مشتری را ندارید' USING ERRCODE = '42501';
  END IF;

  -- P1.5: record WHICH identity this customer moved between. audit_customer_change()
  -- fires on the UPDATE above but only ever recorded name/phone/city/notes/is_active,
  -- so a re-point was invisible in the audit trail.
  IF v_old_person_id IS DISTINCT FROM p_person_id THEN
    INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, diff, created_at)
    VALUES (
      auth.uid(),
      'customer_person_linked',
      'customer',
      p_customer_id::text,
      jsonb_build_object(
        'person_id', jsonb_build_object('old', v_old_person_id, 'new', p_person_id),
        'note', p_note
      ),
      now()
    );
  END IF;

  -- Open a fresh active context link.
  INSERT INTO public.person_context_links(
    person_id, context_kind, ref_table, ref_id, note, started_at, created_by
  )
  VALUES (
    p_person_id, 'customer', 'customers', p_customer_id, p_note, now(), auth.uid()
  )
  RETURNING id INTO v_new_link;

  RETURN v_new_link;
END;
$function$;

-- 5a — remove the function that cannot succeed.
-- Rule 3 permits DROP FUNCTION. Snapshot: docs/verification/pre-322/customer_clear_person.sql
DROP FUNCTION IF EXISTS public.customer_clear_person(uuid, text);

-- ---------------------------------------------------------------------------
-- 5b — let role_permissions decide who may write suppliers.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS suppliers_insert_dynamic ON public.suppliers;
CREATE POLICY suppliers_insert_dynamic
  ON public.suppliers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_dynamic_permission(auth.uid(), 'suppliers', 'create'));

DROP POLICY IF EXISTS suppliers_update_dynamic ON public.suppliers;
CREATE POLICY suppliers_update_dynamic
  ON public.suppliers
  FOR UPDATE
  TO authenticated
  USING (public.has_dynamic_permission(auth.uid(), 'suppliers', 'update'))
  WITH CHECK (public.has_dynamic_permission(auth.uid(), 'suppliers', 'update'));

-- Post-conditions: the function is gone and both policies exist.
DO $assert$
DECLARE
  _fn  int;
  _pol int;
BEGIN
  SELECT count(*) INTO _fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'customer_clear_person';
  IF _fn <> 0 THEN
    RAISE EXCEPTION 'P1.5: customer_clear_person still exists (% overload(s))', _fn;
  END IF;

  SELECT count(*) INTO _pol
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'suppliers'
    AND policyname IN ('suppliers_insert_dynamic', 'suppliers_update_dynamic');
  IF _pol <> 2 THEN
    RAISE EXCEPTION 'P1.5: expected 2 dynamic supplier policies, found %', _pol;
  END IF;
END;
$assert$;
