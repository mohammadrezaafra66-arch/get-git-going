SET client_encoding='UTF8';

-- 551 — person_delete audit row uses entity_type 'person', not 'persons'.
--
-- Symptom (production /admin/persons-cleanup):
--   new row violates row-level security policy for table "audit_logs"
--
-- Cause: person_delete (migration 435) INSERTs audit_logs with
--   entity_type = 'persons'
-- but policy "system inserts audit logs" requires
--   is_valid_audit_entity_type(entity_type)
-- and the allow-list has 'person' (singular), never 'persons'.
-- Measured on test: is_valid_audit_entity_type('persons')=false,
--                   is_valid_audit_entity_type('person')=true.
--
-- Fix: one character of contract — write 'person'. Live body was dumped first;
-- only the entity_type literal changes. Signature unchanged (rule 5).
-- SECURITY INVOKER preserved so persons DELETE RLS stays the gate.

CREATE OR REPLACE FUNCTION public.person_delete(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid        uuid := auth.uid();
  _name       text;
  _blockers   jsonb;
  _total      bigint;
  _summary    text;
  _customer   uuid;
  _supplier   uuid;
  _identifiers int;
  _deleted    int;
BEGIN
  IF NOT public.has_any_role(_uid, ARRAY['admin']::text[]) THEN
    RAISE EXCEPTION 'حذف شخص فقط برای مدیر سیستم ممکن است' USING ERRCODE = '42501';
  END IF;

  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ شخص مشخص نشده است' USING ERRCODE = '22023';
  END IF;

  SELECT p.display_name INTO _name FROM public.persons p WHERE p.id = p_person_id;
  IF _name IS NULL THEN
    RAISE EXCEPTION 'شخص یافت نشد' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'table', b.ref_table, 'label', b.ref_label, 'count', b.row_count)
           ORDER BY b.row_count DESC, b.ref_table), '[]'::jsonb),
         COALESCE(sum(b.row_count), 0),
         string_agg(b.ref_label || ': ' || b.row_count::text, '، '
                    ORDER BY b.row_count DESC, b.ref_table)
    INTO _blockers, _total, _summary
    FROM public.person_delete_blockers(p_person_id) b;

  IF _total > 0 THEN
    RAISE EXCEPTION 'شخص «%» % رکورد وابسته دارد و حذف نمی‌شود (%). سابقهٔ او باید حفظ شود؛ به‌جای حذف، اطلاعات او را کامل کنید.',
      _name, _total, _summary
      USING ERRCODE = '23503';
  END IF;

  SELECT c.id INTO _customer FROM public.customers c WHERE c.person_id = p_person_id;
  SELECT s.id INTO _supplier FROM public.suppliers s WHERE s.person_id = p_person_id;
  SELECT count(*) INTO _identifiers
    FROM public.person_identifiers i WHERE i.person_id = p_person_id;

  -- 551: entity_type must be on is_valid_audit_entity_type allow-list ('person').
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'person', p_person_id::text, 'delete',
          jsonb_build_object(
            'display_name',        _name,
            'customer_id',         _customer,
            'supplier_id',         _supplier,
            'identifiers_removed', _identifiers,
            'blockers',            _blockers));

  DELETE FROM public.customers WHERE person_id = p_person_id;
  DELETE FROM public.suppliers WHERE person_id = p_person_id;

  DELETE FROM public.persons WHERE id = p_person_id;
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  IF _deleted <> 1 THEN
    RAISE EXCEPTION 'حذف شخص انجام نشد؛ دسترسی حذف برای این کاربر تعریف نشده است'
      USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'deleted',              true,
    'person_id',            p_person_id,
    'display_name',         _name,
    'customer_row_removed', _customer IS NOT NULL,
    'supplier_row_removed', _supplier IS NOT NULL,
    'identifiers_removed',  _identifiers);
END;
$function$;

COMMENT ON FUNCTION public.person_delete(uuid) IS
  'Delete a person who has no history. Admin only; SECURITY INVOKER. Migration 551: audit entity_type is person (allow-listed), not persons.';

DO $$
DECLARE
  _def text := pg_get_functiondef('public.person_delete(uuid)'::regprocedure);
BEGIN
  IF _def NOT LIKE '%''person''%' THEN
    RAISE EXCEPTION '551: person_delete missing entity_type person literal';
  END IF;
  IF _def LIKE '%''persons''%' THEN
    RAISE EXCEPTION '551: person_delete still writes entity_type persons';
  END IF;
  IF NOT public.is_valid_audit_entity_type('person') THEN
    RAISE EXCEPTION '551: allow-list unexpectedly rejects person';
  END IF;
  RAISE NOTICE '551 OK: person_delete audits as person';
END
$$;

NOTIFY pgrst, 'reload schema';
