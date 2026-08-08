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
$function$

