SET client_encoding = 'UTF8';

-- 435. A person imported by mistake, with no history, can be removed.
--
-- WHY THIS EXISTS. The Asan person import creates a `persons` row and, since
-- migration 414, a `customers` mirror for every row it commits. When the
-- spreadsheet carried somebody who should never have been imported, there was
-- no way back: 840 functions were scanned and none deletes from `persons` or
-- `customers`, and `persons` carries no DELETE policy at all -- so
-- `DELETE /rest/v1/persons?id=eq.<x>` returns 204 having deleted nothing, for
-- an admin as much as for anyone else. An operator could clear the person's
-- identifiers and the customer mirror and still be left with the person.
--
-- WHAT THIS DOES *NOT* DO. It never cascades a person's history away. Deleting
-- somebody who carries forty pre-invoices is not a delete, it is data loss with
-- a confirmation dialog in front of it. So the path counts first and REFUSES,
-- naming how many rows depend on the person and where they are. There is no
-- force flag and no second, laxer entry point; if a person has history the
-- answer is to complete their record, not to remove them.
--
-- HOW THE DEPENDENCY SET IS DERIVED. From `pg_constraint`, at call time, not
-- from a hand-written list. 29 foreign keys reference `persons(id)` today and
-- the number moves; a list written once goes stale silently and the first thing
-- it will miss is the FK that matters. `person_fk_drift_report` is NOT the
-- reference set either -- it has 15 arms, it was built to find drift between a
-- person and their mirrors, and `customers.person_id`, the constraint that
-- actually blocks every deletion, is not among them.
--
-- Three classes of foreign key, treated differently and on purpose:
--
--   CASCADE  (person_aliases, person_context_links, person_field_values,
--             person_identifiers, person_merge_candidates)
--            -- these ARE the person: their name variants, their phone
--            numbers, their custom fields. Removing the person removes them.
--            Not counted as history.
--   SET NULL (asan_import_person_rows.matched_person_id)
--            -- the import audit row survives and simply stops pointing at a
--            person who no longer exists. Not counted as history.
--   everything else (NO ACTION / RESTRICT)
--            -- real records: quotes, purchases, receipts, vouchers, credit
--            ledgers, staff profiles, merge log. Counted. Any one of them
--            refuses the delete.
--
-- The two mirror rows, `customers.person_id` and `suppliers.person_id`, are the
-- exception inside that last class. They are not history, they are the person's
-- own file, and the import created the customer one unasked. The delete clears
-- them itself -- and it MUST clear them before the `persons` row, because
-- `customers_person_id_fkey` has no ON DELETE clause and would otherwise
-- refuse. But their own children ARE counted: a `dual_documents` row points at
-- `customers(id)` and at no person column, so counting only the person-side FKs
-- would let a real document be cascaded away through the mirror.
--
-- WHY THE ROW COUNT IS RE-READ AFTER THE DELETE. `persons` had no DELETE policy
-- and that is precisely how this failure hides: PostgREST and plain SQL both
-- report success for a DELETE that matched no row, because "no rows visible to
-- this command" and "no rows to delete" are the same statement. So the function
-- asserts `ROW_COUNT = 1` and raises otherwise, which rolls the mirror deletes
-- back with it. A future policy change that narrows admin out cannot turn this
-- into a silent no-op.
--
-- SECURITY. `person_delete` is SECURITY INVOKER, deliberately. The role check at
-- the top gives a readable refusal, but the RLS policies are the real gate and
-- they stay real: an invoker function cannot delete what its caller could not
-- delete by hand. `person_delete_blockers` is SECURITY DEFINER because a count
-- read through the caller's RLS would UNDER-report -- a role that cannot see a
-- person's quotes would be told there are none -- and an under-reported blocker
-- set is the one failure mode this whole migration exists to prevent. It is
-- gated to admin for the same reason the delete is.

------------------------------------------------------------------------------
-- 1. What depends on this person?
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.person_delete_blockers(p_person_id uuid)
RETURNS TABLE(ref_table text, ref_label text, row_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  _rel record;
  _n   bigint;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin']::text[]) THEN
    RAISE EXCEPTION 'بررسی وابستگی‌های یک شخص فقط برای مدیر سیستم ممکن است'
      USING ERRCODE = '42501';
  END IF;

  IF p_person_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ شخص مشخص نشده است' USING ERRCODE = '22023';
  END IF;

  FOR _rel IN
    WITH person_side AS (
      -- Straight at persons(id): counted unless CASCADE / SET NULL, and unless
      -- it is one of the two mirror rows the delete clears itself.
      SELECT src.relname::text AS tbl,
             format('%I = $1', a.attname) AS pred
        FROM pg_constraint k
        JOIN pg_class tgt ON tgt.oid = k.confrelid
        JOIN pg_class src ON src.oid = k.conrelid
        JOIN pg_attribute a
          ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
       WHERE k.contype = 'f'
         AND array_length(k.conkey, 1) = 1
         AND tgt.relnamespace = 'public'::regnamespace
         AND src.relnamespace = 'public'::regnamespace
         AND tgt.relname = 'persons'
         AND k.confdeltype NOT IN ('c', 'n')
         AND NOT (src.relname IN ('customers', 'suppliers') AND a.attname = 'person_id')
    ),
    mirror_side AS (
      -- Children of the customer / supplier mirror. SET NULL children are left
      -- out: the mirror going away simply blanks their pointer. Everything
      -- else, CASCADE included, is counted -- a CASCADE here would delete real
      -- credit rows without anybody being asked.
      SELECT src.relname::text AS tbl,
             format('%I IN (SELECT m.id FROM public.%I m WHERE m.person_id = $1)',
                    a.attname, tgt.relname) AS pred
        FROM pg_constraint k
        JOIN pg_class tgt ON tgt.oid = k.confrelid
        JOIN pg_class src ON src.oid = k.conrelid
        JOIN pg_attribute a
          ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
       WHERE k.contype = 'f'
         AND array_length(k.conkey, 1) = 1
         AND tgt.relnamespace = 'public'::regnamespace
         AND src.relnamespace = 'public'::regnamespace
         AND tgt.relname IN ('customers', 'suppliers')
         AND k.confdeltype <> 'n'
    ),
    both_sides AS (
      SELECT * FROM person_side
      UNION ALL
      SELECT * FROM mirror_side
    )
    -- One row per table, OR-ing its predicates, so a table reachable by two
    -- routes (customer_credit_balance holds both customer_person_id and
    -- customer_id) is counted once rather than twice.
    SELECT tbl, string_agg(pred, ' OR ') AS preds
      FROM both_sides
     GROUP BY tbl
     ORDER BY tbl
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %s', _rel.tbl, _rel.preds)
       INTO _n
      USING p_person_id;

    IF _n > 0 THEN
      ref_table  := _rel.tbl;
      ref_label  := CASE _rel.tbl
        WHEN 'sales_quotes'                          THEN 'پیش‌فاکتور'
        WHEN 'purchases'                             THEN 'خرید'
        WHEN 'purchase_prices'                       THEN 'قیمت خرید'
        WHEN 'product_suppliers'                     THEN 'تأمین‌کنندهٔ کالا'
        WHEN 'payment_receipts'                      THEN 'دریافت'
        WHEN 'payment_vouchers'                      THEN 'پرداخت'
        WHEN 'dual_documents'                        THEN 'سند دوطرفه'
        WHEN 'delivery_receipts'                     THEN 'حواله/رسید تحویل'
        WHEN 'mutual_settlements'                    THEN 'تهاتر'
        WHEN 'credit_requests'                       THEN 'درخواست اعتبار'
        WHEN 'credit_score_snapshots'                THEN 'سابقهٔ امتیاز اعتباری'
        WHEN 'customer_credit_balance'               THEN 'مانده اعتبار'
        WHEN 'customer_credit_ledger'                THEN 'دفتر اعتبار'
        WHEN 'customer_credit_profile'               THEN 'پروندهٔ اعتباری'
        WHEN 'customer_capital_allocations_dynamic'  THEN 'سقف اعتبار'
        WHEN 'didar_activities'                      THEN 'فعالیت دیدار'
        WHEN 'profiles'                              THEN 'کاربر سیستم'
        WHEN 'person_merge_log'                      THEN 'سابقهٔ ادغام'
        WHEN 'external_parties'                      THEN 'پروندهٔ طرف حساب'
        ELSE _rel.tbl
      END;
      row_count := _n;
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$fn$;

COMMENT ON FUNCTION public.person_delete_blockers(uuid) IS
  'Rows that stop a person being deleted, one line per table, derived from pg_constraint at call time. Admin only.';

REVOKE ALL ON FUNCTION public.person_delete_blockers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.person_delete_blockers(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.person_delete_blockers(uuid) TO authenticated;

------------------------------------------------------------------------------
-- 2. The DELETE policy. Admin only -- this widens a surface that had none.
------------------------------------------------------------------------------

DROP POLICY IF EXISTS persons_delete_admin ON public.persons;
CREATE POLICY persons_delete_admin
  ON public.persons
  FOR DELETE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin']::text[]));

COMMENT ON POLICY persons_delete_admin ON public.persons IS
  'Only an admin may delete a person. The FK graph (customers/suppliers/quotes/... without ON DELETE) is the second gate: a person with history cannot be deleted even by an admin, whatever route is used.';

------------------------------------------------------------------------------
-- 3. The delete itself.
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.person_delete(p_person_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
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

  -- Written before the delete so the person's name is still readable, and
  -- inside the same transaction so a refused delete leaves no audit row.
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'persons', p_person_id::text, 'delete',
          jsonb_build_object(
            'display_name',        _name,
            'customer_id',         _customer,
            'supplier_id',         _supplier,
            'identifiers_removed', _identifiers,
            'blockers',            _blockers));

  -- Mirrors first: customers_person_id_fkey and suppliers_person_id_fkey carry
  -- no ON DELETE clause, so the persons row cannot go before they do.
  DELETE FROM public.customers WHERE person_id = p_person_id;
  DELETE FROM public.suppliers WHERE person_id = p_person_id;

  DELETE FROM public.persons WHERE id = p_person_id;
  GET DIAGNOSTICS _deleted = ROW_COUNT;

  IF _deleted <> 1 THEN
    -- Zero rows here means the DELETE policy did not admit this caller. Raising
    -- rolls the mirror deletes back; returning quietly would repeat the exact
    -- bug this migration fixes, one layer up.
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
$fn$;

COMMENT ON FUNCTION public.person_delete(uuid) IS
  'Delete a person who has no history. Counts dependants first and refuses, naming them. Admin only; SECURITY INVOKER so the RLS DELETE policy stays the real gate.';

REVOKE ALL ON FUNCTION public.person_delete(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.person_delete(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.person_delete(uuid) TO authenticated;

------------------------------------------------------------------------------
-- 4. Verify
------------------------------------------------------------------------------

DO $verify$
DECLARE
  _pol   int;
  _fn    int;
  _other int;
BEGIN
  SELECT count(*) INTO _pol
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'persons'
     AND policyname = 'persons_delete_admin' AND cmd = 'DELETE';
  IF _pol <> 1 THEN RAISE EXCEPTION '435: persons_delete_admin policy missing'; END IF;

  SELECT count(*) INTO _other
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'persons'
     AND cmd IN ('DELETE', 'ALL') AND policyname <> 'persons_delete_admin';
  IF _other <> 0 THEN
    RAISE EXCEPTION '435: another policy also admits DELETE on persons (%); the surface must stay one policy wide', _other;
  END IF;

  SELECT count(*) INTO _fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname IN ('person_delete', 'person_delete_blockers');
  IF _fn <> 2 THEN RAISE EXCEPTION '435: expected 2 functions, found %', _fn; END IF;

  IF (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'person_delete') THEN
    RAISE EXCEPTION '435: person_delete must be SECURITY INVOKER so RLS stays the gate';
  END IF;

  RAISE NOTICE '435: delete path present, policy admin-only, invoker semantics intact';
END
$verify$;
